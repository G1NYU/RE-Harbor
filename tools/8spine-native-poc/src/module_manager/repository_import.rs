//! Explicit host-only retrieval. Repository content is untrusted data.
//! No automatic installation, executable persistence, or module execution.
use super::*;
use crate::http_transport::{AuthorizedRequest, NetworkSession};
use std::net::IpAddr;

fn registered(manager: &ModuleManager, repository: &str) -> Result<(), &'static str> {
    if !manager.repositories.contains(repository) { return Err("repository-not-registered"); }
    Ok(())
}

fn request_for(exact_url: &str) -> Result<AuthorizedRequest, &'static str> {
    let url = approved_url(exact_url, None)?;
    if url.as_str() != exact_url { return Err("invalid-url"); }
    let host = url.host_str().ok_or("invalid-url")?;
    // A distinct, ephemeral host retrieval grant scoped to this exact URL.
    // No permission is transferred to the module.
    let version = fingerprint(exact_url.as_bytes());
    let grant = NetworkGrant::new("repository-import", &version, &[host])?;
    let mut session = NetworkSession::new(&grant, "repository-import", &version)?;
    session.authorize("GET", exact_url)
}

pub struct CatalogFetch {
    repository: String,
    request: AuthorizedRequest,
}

pub struct RepositoryCatalog {
    repository: String,
    entries: Vec<CatalogEntry>,
}

impl RepositoryCatalog {
    pub fn entries(&self) -> &[CatalogEntry] { &self.entries }

    /// The host must display the exact selected download URL and receive
    /// explicit user authorization before constructing a package fetch.
    pub fn prepare_package(&self, manager: &ModuleManager, key: &ModuleKey,
        approved_exact_url: &str) -> Result<PackageFetch, &'static str> {
        registered(manager, &self.repository)?;
        let row = self.entries.iter().find(|row| &row.key == key).ok_or("catalog-entry-missing")?;
        if row.download != approved_exact_url { return Err("download-not-approved"); }
        Ok(PackageFetch { row: row.clone(), request: request_for(approved_exact_url)? })
    }
}

impl CatalogFetch {
    /// This is a single-use host request for an explicitly added repository.
    pub fn prepare(manager: &ModuleManager, input: &str) -> Result<Self, &'static str> {
        let repository = store::repository_index(input)?;
        registered(manager, &repository)?;
        let request = request_for(&repository)?;
        Ok(Self { repository, request })
    }

    pub fn hostname(&self) -> &str { self.request.hostname() }

    /// Host-owned live lookup. No caller-supplied DNS pins.
    pub async fn fetch_live(self, manager: &ModuleManager) -> Result<RepositoryCatalog, &'static str> {
        registered(manager, &self.repository)?;
        let (status, bytes) = self.request.send_resolved_bytes(MAX_INDEX).await?;
        accept_catalog(manager, self.repository, status, &bytes)
    }

    pub async fn fetch(self, manager: &ModuleManager, resolved_host: &str,
        pins: &[IpAddr]) -> Result<RepositoryCatalog, &'static str> {
        registered(manager, &self.repository)?;
        let (status, bytes) = self.request.send_bounded_bytes(resolved_host, pins, MAX_INDEX).await?;
        accept_catalog(manager, self.repository, status, &bytes)
    }
}

fn accept_catalog(manager: &ModuleManager, repository: String, status: u16,
    bytes: &[u8]) -> Result<RepositoryCatalog, &'static str> {
    registered(manager, &repository)?;
    if status != 200 { return Err("repository-http-status"); }
    Ok(RepositoryCatalog { entries: parse_catalog(&repository, bytes)?, repository })
}

pub struct PackageFetch {
    row: CatalogEntry,
    request: AuthorizedRequest,
}

impl PackageFetch {
    pub fn hostname(&self) -> &str { self.request.hostname() }

    /// Hold the exclusive host manager borrow across retrieval and staging.
    /// A repository cannot be removed during this operation.
    pub async fn fetch_and_stage_live(self, manager: &mut ModuleManager) -> Result<PackageFormat, &'static str> {
        registered(manager, &self.row.key.repository)?;
        let (status, bytes) = self.request.send_resolved_bytes(MAX_PACKAGE).await?;
        accept_package(manager, &self.row, status, &bytes)
    }

    pub async fn fetch_and_stage(self, manager: &mut ModuleManager,
        resolved_host: &str, pins: &[IpAddr]) -> Result<PackageFormat, &'static str> {
        registered(manager, &self.row.key.repository)?;
        let (status, bytes) = self.request.send_bounded_bytes(resolved_host, pins, MAX_PACKAGE).await?;
        accept_package(manager, &self.row, status, &bytes)
    }
}

fn accept_package(manager: &mut ModuleManager, row: &CatalogEntry, status: u16,
    bytes: &[u8]) -> Result<PackageFormat, &'static str> {
    registered(manager, &row.key.repository)?;
    if status != 200 { return Err("package-http-status"); }
    manager.stage(row, bytes)
}

#[cfg(test)]
mod tests {
    use super::*;
    const REPOSITORY: &str = "https://modules.example.com/index.json";
    const DOWNLOAD: &str = "https://files.example.com/fixture.8spine";
    const INDEX: &[u8] = br#"{"category:modules":[{"id":"fixture","type":"MODULE","name":"Fixture","version":"1","download":"https://files.example.com/fixture.8spine","trusted":true}]}"#;

    #[test]
    fn explicit_registered_catalog_and_exact_package_selection() {
        let mut manager = ModuleManager::default();
        assert_eq!(CatalogFetch::prepare(&manager, REPOSITORY).err(), Some("repository-not-registered"));
        manager.add_repository(REPOSITORY).unwrap();
        assert_eq!(CatalogFetch::prepare(&manager, REPOSITORY).unwrap().hostname(), "modules.example.com");
        assert_eq!(accept_catalog(&manager, REPOSITORY.to_owned(), 404, INDEX).err(), Some("repository-http-status"));
        assert_eq!(accept_catalog(&manager, REPOSITORY.to_owned(), 200, &vec![0; MAX_INDEX + 1]).err(), Some("index-limit"));
        let catalog = accept_catalog(&manager, REPOSITORY.to_owned(), 200, INDEX).unwrap();
        let row = &catalog.entries()[0];
        assert_eq!(catalog.prepare_package(&manager, &row.key, "https://other.example.com/fixture.8spine").err(), Some("download-not-approved"));
        assert_eq!(catalog.prepare_package(&manager, &row.key, DOWNLOAD).unwrap().hostname(), "files.example.com");
        let mut unknown = row.key.clone();
        unknown.id = "missing".to_owned();
        assert_eq!(catalog.prepare_package(&manager, &unknown, DOWNLOAD).err(), Some("catalog-entry-missing"));
        assert_eq!(manager.modules().count(), 0);
        assert_eq!(accept_package(&mut manager, row, 404, b"return {};"), Err("package-http-status"));
        assert_eq!(manager.modules().count(), 0);
        assert_eq!(accept_package(&mut manager, row, 200, &vec![0; MAX_PACKAGE + 1]), Err("package-limit"));
        assert_eq!(accept_package(&mut manager, row, 200, b"8SM1.opaque"), Ok(PackageFormat::Packed8sm1));
        let staged = manager.get(&row.key).unwrap();
        assert!(!staged.enabled());
        let sha = staged.fingerprint().to_owned();
        assert_eq!(manager.approve(&row.key, &sha, &["api.example.com"]), Err("unsupported-package"));
        manager.remove_repository(REPOSITORY).unwrap();
        assert_eq!(catalog.prepare_package(&manager, &row.key, DOWNLOAD).err(), Some("repository-not-registered"));
        assert_eq!(accept_package(&mut manager, row, 200, b"return {};"), Err("repository-not-registered"));
    }

    #[tokio::test]
    async fn denied_pins_fail_before_network_and_do_not_stage() {
        let mut manager = ModuleManager::default();
        manager.add_repository(REPOSITORY).unwrap();
        let pins = ["127.0.0.1".parse().unwrap()];
        let fetch = CatalogFetch::prepare(&manager, REPOSITORY).unwrap();
        assert_eq!(fetch.fetch(&manager, "modules.example.com", &pins).await.err(), Some("address-denied"));
        let catalog = accept_catalog(&manager, REPOSITORY.to_owned(), 200, INDEX).unwrap();
        let row = &catalog.entries()[0];
        let fetch = catalog.prepare_package(&manager, &row.key, DOWNLOAD).unwrap();
        assert_eq!(fetch.fetch_and_stage(&mut manager, "files.example.com", &pins).await, Err("address-denied"));
        assert_eq!(manager.modules().count(), 0);
    }
}
