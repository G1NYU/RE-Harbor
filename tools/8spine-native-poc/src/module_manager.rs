//! Host-only catalog/staging/consent model. No downloads or execution.
mod store;
mod source_format;
pub mod repository_import;
pub mod network_broker;
pub use store::{load_state, save_state};
use crate::http_transport::NetworkGrant;
pub use crate::catalog::{parse_catalog, CatalogEntry, ModuleKey};
use crate::catalog::{approved_url, entry, MAX_INDEX};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, BTreeSet};
use std::sync::Arc;

const MAX_PACKAGE: usize = 2 * 1024 * 1024;
const MAX_INSTALLED: usize = 64;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum PackageFormat {
    JavascriptCandidate,
    Packed8sm1,
    Unknown,
}

fn fingerprint(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}

fn classify(bytes: &[u8]) -> PackageFormat {
    if bytes.starts_with(b"8SM1.") { return PackageFormat::Packed8sm1; }
    if source_format::module_body(bytes).is_ok() {
        PackageFormat::JavascriptCandidate
    } else {
        PackageFormat::Unknown
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StagedModule {
    entry: CatalogEntry,
    fingerprint: String,
    format: PackageFormat,
    enabled: bool,
    hosts: BTreeSet<String>,
    #[serde(skip)]
    generation: u64,
    // A persisted fingerprint is only metadata until the actual bytes are restaged.
    #[serde(skip)]
    verified: bool,
}

impl StagedModule {
    pub fn entry(&self) -> &CatalogEntry { &self.entry }
    pub fn verified(&self) -> bool { self.verified }
    pub fn hosts(&self) -> impl Iterator<Item = &str> { self.hosts.iter().map(String::as_str) }

    /// Display status only; never an execution authorization.
    pub fn status(&self) -> &'static str {
        match self.format {
            PackageFormat::Packed8sm1 | PackageFormat::Unknown => "unsupported",
            PackageFormat::JavascriptCandidate if !self.verified => "needs-verification",
            PackageFormat::JavascriptCandidate if self.enabled => "approved",
            PackageFormat::JavascriptCandidate => "disabled",
        }
    }

    pub fn fingerprint(&self) -> &str { &self.fingerprint }
    pub fn format(&self) -> PackageFormat { self.format }
    pub fn enabled(&self) -> bool { self.enabled }
}

/// Non-serializable, host-minted capability. Recheck before every new operation.
pub struct ModulePermit {
    key: ModuleKey,
    fingerprint: String,
    generation: u64,
    owner: Arc<()>,
}

#[derive(Default)]
pub struct ModuleManager {
    staged: BTreeMap<ModuleKey, StagedModule>,
    generation: u64,
    owner: Arc<()>,
    repositories: BTreeSet<String>,
}

impl ModuleManager {
    fn next_generation(&mut self) -> Result<u64, &'static str> {
        self.generation = self.generation.checked_add(1).ok_or("generation-limit")?;
        Ok(self.generation)
    }

    pub fn get(&self, key: &ModuleKey) -> Option<&StagedModule> { self.staged.get(key) }

    pub fn repositories(&self) -> impl Iterator<Item = &str> {
        self.repositories.iter().map(String::as_str)
    }

    pub fn modules(&self) -> impl Iterator<Item = &StagedModule> { self.staged.values() }

    pub fn add_repository(&mut self, input: &str) -> Result<String, &'static str> {
        let canonical = store::repository_index(input)?;
        if !self.repositories.contains(&canonical) && self.repositories.len() >= store::MAX_REPOSITORIES {
            return Err("repository-limit");
        }
        self.repositories.insert(canonical.clone());
        Ok(canonical)
    }

    /// Forget the repository and revoke all of its staged module permits.
    pub fn remove_repository(&mut self, input: &str) -> Result<bool, &'static str> {
        let canonical = store::repository_index(input)?;
        self.staged.retain(|key, _| key.repository != canonical);
        Ok(self.repositories.remove(&canonical))
    }

    /// Explicit staging only. Caller must independently retrieve the selected package.
    /// The bytes are inspected/fingerprinted but never saved or executed by this model.
    pub fn stage(&mut self, entry: &CatalogEntry, bytes: &[u8]) -> Result<PackageFormat, &'static str> {
        if bytes.is_empty() || bytes.len() > MAX_PACKAGE { return Err("package-limit"); }
        if !self.staged.contains_key(&entry.key) && self.staged.len() >= MAX_INSTALLED {
            return Err("installed-limit");
        }
        // Revalidate even if the caller constructs the public metadata struct directly.
        let repository = approved_url(&entry.key.repository, None)?;
        let canonical = self::entry(&repository, &serde_json::json!({
            "id": entry.key.id, "name": entry.name, "version": entry.version,
            "download": entry.download, "author": entry.author
        }))?;
        if &canonical != entry { return Err("invalid-metadata"); }
        let sha = fingerprint(bytes);
        let format = classify(bytes);
        if self.staged.get(&entry.key).is_some_and(|prior| prior.verified && prior.entry == *entry && prior.fingerprint == sha && prior.format == format) {
            return Ok(format);
        }
        let generation = self.next_generation()?;
        self.staged.insert(entry.key.clone(), StagedModule {
            entry: entry.clone(), fingerprint: sha, format, enabled: false,
            hosts: BTreeSet::new(), generation, verified: true,
        });
        Ok(format)
    }

    /// Host/UI calls this only after the user approves exact bytes and host names.
    pub fn approve(&mut self, key: &ModuleKey, expected_sha: &str, hosts: &[&str]) -> Result<(), &'static str> {
        let row = self.staged.get(key).ok_or("not-staged")?;
        if row.fingerprint != expected_sha { return Err("stale-approval"); }
        if !row.verified { return Err("package-not-verified"); }
        if row.format != PackageFormat::JavascriptCandidate { return Err("unsupported-package"); }
        // Bind the grant to the SHA as well as module scope, not the advertised version alone.
        NetworkGrant::new(&row.entry.key.id, &row.fingerprint, hosts)?;
        let generation = self.next_generation()?;
        let row = self.staged.get_mut(key).ok_or("not-staged")?;
        row.generation = generation;
        row.hosts = hosts.iter().map(|s| (*s).to_owned()).collect();
        row.enabled = true;
        Ok(())
    }

    pub fn disable(&mut self, key: &ModuleKey) -> Result<(), &'static str> {
        if !self.staged.contains_key(key) { return Err("not-staged"); }
        let generation = self.next_generation()?;
        let row = self.staged.get_mut(key).ok_or("not-staged")?;
        row.generation = generation;
        row.enabled = false;
        row.hosts.clear();
        Ok(())
    }

    pub fn remove(&mut self, key: &ModuleKey) -> bool { self.staged.remove(key).is_some() }

    pub fn permit(&self, key: &ModuleKey, bytes: &[u8]) -> Result<ModulePermit, &'static str> {
        let row = self.staged.get(key).ok_or("not-staged")?;
        if !row.enabled { return Err("disabled"); }
        if !row.verified || bytes.len() > MAX_PACKAGE || fingerprint(bytes) != row.fingerprint || classify(bytes) != PackageFormat::JavascriptCandidate { return Err("package-mismatch"); }
        Ok(ModulePermit { key: key.clone(), fingerprint: row.fingerprint.clone(), generation: row.generation, owner: Arc::clone(&self.owner) })
    }

    /// Prepare a documented plain source body as inert text for a future
    /// isolated worker. This is not a syntax validator or execution entry point.
    /// The exact original bytes (not the normalized body) are consent-bound.
    pub fn approved_source_body(&self, permit: &ModulePermit, bytes: &[u8]) -> Result<String, &'static str> {
        self.network_grant(permit)?;
        if bytes.len() > MAX_PACKAGE || fingerprint(bytes) != permit.fingerprint {
            return Err("package-mismatch");
        }
        source_format::module_body(bytes)
    }

    pub(crate) fn authorize_media_url(&self, permit: &ModulePermit, grant: &NetworkGrant, url: &str) -> Result<(), &'static str> {
        self.network_grant(permit)?;
        let mut session = crate::http_transport::NetworkSession::new(grant, &permit.key.id, &permit.fingerprint)?;
        session.authorize("GET", url)?;
        Ok(())
    }

    /// No worker may mint this grant. Disable, remove, or restaging invalidates permits.
    /// A future supervisor must also recheck immediately before writes and cancel active tasks.
    pub fn network_grant(&self, permit: &ModulePermit) -> Result<NetworkGrant, &'static str> {
        if !Arc::ptr_eq(&self.owner, &permit.owner) { return Err("revoked"); }
        let row = self.staged.get(&permit.key).ok_or("revoked")?;
        if !row.enabled || row.generation != permit.generation || row.fingerprint != permit.fingerprint {
            return Err("revoked");
        }
        let hosts: Vec<&str> = row.hosts.iter().map(String::as_str).collect();
        NetworkGrant::new(&row.entry.key.id, &row.fingerprint, &hosts)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    const REPO: &str = "https://modules.example.com/index.json";
    const JS: &[u8] = b"return { searchTracks() { return { tracks: [], total: 0 }; } };";
    fn module() -> Value {
        json!({"type":"MODULE","id":"fixture","name":"Fixture","version":"1.0","download":"/modules/test.8spine","trusted":true})
    }
    fn catalog(repo: &str, rows: Vec<Value>) -> Vec<CatalogEntry> {
        parse_catalog(repo, &json!({"category:modules":rows,"external_sources":["https://other.example.com/index.json"]}).to_string().into_bytes()).unwrap()
    }

    #[test]
    fn catalog_is_metadata_only_and_repository_scoped() {
        let mut access = module();
        access.as_object_mut().unwrap().remove("download");
        let mut local = module();
        local["download"] = json!("https://127.0.0.1/package");
        let mut art = module();
        art["type"] = json!("ARTWORK");
        let mut loader = module();
        loader["id"] = json!("app-loader");
        loader["labels"] = json!(["export", " Loader "]);
        let mut tagged_loader = module();
        tagged_loader["id"] = json!("another-loader");
        tagged_loader["tags"] = json!(["LOADER"]);
        let rows = catalog(REPO, vec![module(), module(), access, local, art, loader, tagged_loader]);
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].download, "https://modules.example.com/modules/test.8spine");
        let other = catalog("https://other.example.com/index.json", vec![module()]);
        assert_ne!(rows[0].key, other[0].key);
        let mut conflict = module();
        conflict["version"] = json!("2");
        let raw = json!({"category:modules":[module(), conflict]}).to_string();
        assert_eq!(parse_catalog(REPO, raw.as_bytes()), Err("catalog-conflict"));
        assert_eq!(parse_catalog(REPO, &vec![b'x'; MAX_INDEX + 1]), Err("index-limit"));
    }

    #[test]
    fn explicit_music_category_accepts_untyped_community_entries_only() {
        let mut plain = module();
        plain.as_object_mut().unwrap().remove("type");
        plain["download"] = json!("community.js");
        let mut loader = plain.clone();
        loader["id"] = json!("loader");
        loader["labels"] = json!(["LOADER"]);
        let mut artwork = plain.clone();
        artwork["id"] = json!("art");
        artwork["type"] = json!("ARTWORK");
        let mut null = plain.clone();
        null["id"] = json!("null");
        null["type"] = Value::Null;
        let mut untyped = plain.clone();
        untyped["id"] = json!("untyped");
        let raw = json!({
            "category:music": [plain, loader, artwork, null],
            "category:modules": [untyped]
        }).to_string();
        let entries = parse_catalog(REPO, raw.as_bytes()).unwrap();
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].key.id, "fixture");
        assert_eq!(entries[0].download, "https://modules.example.com/community.js");
        let mut manager = ModuleManager::default();
        manager.stage(&entries[0], JS).unwrap();
        assert_eq!(manager.get(&entries[0].key).unwrap().status(), "disabled");
    }

    #[test]
    fn management_status_distinguishes_approval_and_unsupported_formats() {
        let row = catalog(REPO, vec![module()]).remove(0);
        let mut manager = ModuleManager::default();
        manager.stage(&row, JS).unwrap();
        let staged = manager.get(&row.key).unwrap();
        assert_eq!(staged.entry(), &row);
        assert!(staged.verified());
        assert_eq!(staged.status(), "disabled");
        assert_eq!(staged.hosts().count(), 0);
        let hash = staged.fingerprint().to_owned();
        manager.approve(&row.key, &hash, &["api.example.com"]).unwrap();
        let staged = manager.get(&row.key).unwrap();
        assert_eq!(staged.status(), "approved");
        assert_eq!(staged.hosts().collect::<Vec<_>>(), vec!["api.example.com"]);
        manager.disable(&row.key).unwrap();
        assert_eq!(manager.get(&row.key).unwrap().status(), "disabled");
        manager.stage(&row, b"8SM1.opaque").unwrap();
        assert_eq!(manager.get(&row.key).unwrap().status(), "unsupported");
        assert!(manager.remove(&row.key));
        assert!(manager.get(&row.key).is_none());
    }

    #[test]
    fn explicit_consent_and_exact_hash_are_required() {
        let row = catalog(REPO, vec![module()]).remove(0);
        let mut manager = ModuleManager::default();
        assert_eq!(manager.stage(&row, JS), Ok(PackageFormat::JavascriptCandidate));
        assert!(!manager.get(&row.key).unwrap().enabled());
        assert_eq!(manager.permit(&row.key, JS).err(), Some("disabled"));
        let hash = manager.get(&row.key).unwrap().fingerprint().to_owned();
        assert_eq!(manager.approve(&row.key, "wrong-hash", &["api.example.com"]), Err("stale-approval"));
        assert!(manager.approve(&row.key, &hash, &["*.example.com"]).is_err());
        manager.approve(&row.key, &hash, &["api.example.com"]).unwrap();
        assert_eq!(manager.permit(&row.key, b"return {};").err(), Some("package-mismatch"));
        let permit = manager.permit(&row.key, JS).unwrap();
        assert_eq!(manager.approved_source_body(&permit, JS).unwrap().as_bytes(), JS);
        assert_eq!(manager.approved_source_body(&permit, b"return {};"), Err("package-mismatch"));
        let grant = manager.network_grant(&permit).unwrap();
        let mut session = crate::http_transport::NetworkSession::new(&grant, &row.key.id, &hash).unwrap();
        assert!(session.authorize("GET", "https://api.example.com/catalog").is_ok());
        assert!(session.authorize("GET", "https://other.example.com/catalog").is_err());
        manager.disable(&row.key).unwrap();
        assert_eq!(manager.approved_source_body(&permit, JS), Err("revoked"));
        assert_eq!(manager.network_grant(&permit).err(), Some("revoked"));
    }

    #[test]
    fn updates_and_removal_never_inherit_old_approval() {
        let mut row = catalog(REPO, vec![module()]).remove(0);
        let mut manager = ModuleManager::default();
        manager.stage(&row, JS).unwrap();
        let hash = manager.get(&row.key).unwrap().fingerprint().to_owned();
        manager.approve(&row.key, &hash, &["api.example.com"]).unwrap();
        let permit = manager.permit(&row.key, JS).unwrap();
        manager.stage(&row, JS).unwrap();
        assert!(manager.network_grant(&permit).is_ok());
        row.version = "2".to_owned();
        manager.stage(&row, JS).unwrap();
        assert!(!manager.get(&row.key).unwrap().enabled());
        assert_eq!(manager.network_grant(&permit).err(), Some("revoked"));
        manager.approve(&row.key, &hash, &["api.example.com"]).unwrap();
        let second = manager.permit(&row.key, JS).unwrap();
        manager.stage(&row, b"return {};").unwrap();
        assert_eq!(manager.network_grant(&second).err(), Some("revoked"));
        assert_eq!(manager.approve(&row.key, &hash, &["api.example.com"]), Err("stale-approval"));
        assert!(manager.remove(&row.key));
        assert!(manager.get(&row.key).is_none());
    }

    #[test]
    fn packed_unknown_and_oversized_packages_remain_disabled() {
        let row = catalog(REPO, vec![module()]).remove(0);
        let mut manager = ModuleManager::default();
        for (bytes, format) in [(b"8SM1.opaque".as_slice(), PackageFormat::Packed8sm1), (b"<html>error</html>".as_slice(), PackageFormat::Unknown)] {
            assert_eq!(manager.stage(&row, bytes), Ok(format));
            let hash = manager.get(&row.key).unwrap().fingerprint().to_owned();
            assert_eq!(manager.approve(&row.key, &hash, &["api.example.com"]), Err("unsupported-package"));
        }
        assert_eq!(manager.stage(&row, &vec![0; MAX_PACKAGE + 1]), Err("package-limit"));
    }
}
