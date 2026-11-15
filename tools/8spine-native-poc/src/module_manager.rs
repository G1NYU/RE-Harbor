//! Host-only catalog/staging/consent model. No downloads or execution.
mod store;
pub use store::{load_state, save_state};
use crate::http_transport::{valid_dns_name, NetworkGrant};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, BTreeSet};
use std::sync::Arc;
use url::{Host, Url};

const MAX_INDEX: usize = 256 * 1024;
const MAX_PACKAGE: usize = 2 * 1024 * 1024;
const MAX_ENTRIES: usize = 1000;
const MAX_INSTALLED: usize = 64;

fn field(value: &Value, max: usize) -> Result<String, &'static str> {
    let value = value.as_str().ok_or("invalid-field")?;
    if value.trim().is_empty() || value.len() > max || value.chars().any(char::is_control) {
        return Err("invalid-field");
    }
    Ok(value.to_owned())
}

fn approved_url(raw: &str, base: Option<&Url>) -> Result<Url, &'static str> {
    if raw.len() > 4096 || !raw.is_ascii() || raw.bytes().any(|b| b <= 32 || b == 127 || b == b'\\') {
        return Err("invalid-url");
    }
    let url = match base {
        Some(base) => base.join(raw),
        None => Url::parse(raw),
    }.map_err(|_| "invalid-url")?;
    let Some(Host::Domain(host)) = url.host() else { return Err("invalid-url"); };
    // The raw authority check also rejects explicitly empty userinfo.
    let authority = raw.strip_prefix("https://").or_else(|| raw.strip_prefix("//"));
    if url.scheme() != "https" || !valid_dns_name(host)
        || !url.username().is_empty() || url.password().is_some() || url.port().is_some()
        || url.fragment().is_some()
        || authority.and_then(|s| s.split(['/', '?', '#']).next()).is_some_and(|s| s.contains('@'))
    {
        return Err("invalid-url");
    }
    Ok(url)
}

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ModuleKey {
    pub repository: String,
    pub id: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CatalogEntry {
    pub key: ModuleKey,
    pub name: String,
    pub version: String,
    pub download: String,
    pub author: Option<String>,
}

fn entry(repository: &Url, raw: &Value) -> Result<CatalogEntry, &'static str> {
    let id = field(&raw["id"], 128)?;
    if !id.bytes().all(|b| b.is_ascii_alphanumeric() || matches!(b, b'-' | b'_' | b'.')) {
        return Err("invalid-id");
    }
    let target = raw.get("download").and_then(Value::as_str)
        .or_else(|| raw.get("file").and_then(Value::as_str)).ok_or("invalid-url")?;
    let download = approved_url(target, Some(repository))?.to_string();
    let version = field(&raw["version"], 128)?;
    Ok(CatalogEntry {
        key: ModuleKey { repository: repository.to_string(), id },
        name: field(&raw["name"], 256)?,
        version,
        download,
        author: raw.get("author").and_then(|value| field(value, 256).ok()),
    })
}

/// Pure metadata ingestion. Repository flags such as "trusted" are not grants.
pub fn parse_catalog(repository: &str, bytes: &[u8]) -> Result<Vec<CatalogEntry>, &'static str> {
    if bytes.len() > MAX_INDEX { return Err("index-limit"); }
    let repository = approved_url(repository, None)?;
    let root: Value = serde_json::from_slice(bytes).map_err(|_| "invalid-index")?;
    let object = root.as_object().ok_or("invalid-index")?;
    let mut found_category = false;
    let mut entries = BTreeMap::<ModuleKey, CatalogEntry>::new();
    let mut inspected = 0;
    for (category, list) in object {
        if !category.starts_with("category:") || matches!(category.as_str(), "category:artworks" | "category:testing" | "category:debrid_modules") {
            continue;
        }
        let Some(list) = list.as_array() else { continue; };
        found_category = true;
        for raw in list {
            inspected += 1;
            if inspected > MAX_ENTRIES { return Err("catalog-limit"); }
            if raw["type"] != "MODULE" { continue; }
            // Records without a concrete package URL (access-only) are not installable.
            let Ok(row) = entry(&repository, raw) else { continue; };
            if let Some(prior) = entries.get(&row.key) {
                if prior != &row { return Err("catalog-conflict"); }
                continue;
            }
            entries.insert(row.key.clone(), row);
        }
    }
    if !found_category { return Err("invalid-index"); }
    Ok(entries.into_values().collect())
}

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
    let Ok(source) = std::str::from_utf8(bytes) else { return PackageFormat::Unknown; };
    let trimmed = source.trim_start();
    if trimmed.starts_with("export ") || trimmed.starts_with("return ") {
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
        let rows = catalog(REPO, vec![module(), module(), access, local, art]);
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
        let grant = manager.network_grant(&permit).unwrap();
        let mut session = crate::http_transport::NetworkSession::new(&grant, &row.key.id, &hash).unwrap();
        assert!(session.authorize("GET", "https://api.example.com/catalog").is_ok());
        assert!(session.authorize("GET", "https://other.example.com/catalog").is_err());
        manager.disable(&row.key).unwrap();
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
