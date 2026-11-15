//! Persistent, non-executable metadata in a trusted host-owned application directory.
//! The snapshot is not an approval authority. Reload always revokes all privileges.
use super::*;
use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};

pub(super) const MAX_REPOSITORIES: usize = 32;
const MAX_STATE: usize = 2 * 1024 * 1024;
const STATE_FILE: &str = "8spine-state.json";

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Snapshot {
    version: u32,
    repositories: Vec<String>,
    modules: Vec<SavedModule>,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct SavedModule {
    entry: CatalogEntry,
    fingerprint: String,
    format: PackageFormat,
}

/// Accept the repository homepage or an explicit index JSON URL.
/// Do not fetch it or follow additional indexes here.
pub(super) fn repository_index(input: &str) -> Result<String, &'static str> {
    let mut url = approved_url(input, None)?;
    if url.query().is_some() || !input.starts_with("https://") {
        return Err("invalid-url");
    }
    if url.path().ends_with('/') {
        url = url.join("index.json").map_err(|_| "invalid-url")?;
    } else if url.path().rsplit('/').next().is_some_and(|s| !s.ends_with(".json")) {
        let path = format!("{}/index.json", url.path());
        url.set_path(&path);
    }
    if url.as_str().len() > 4096 { return Err("invalid-url"); }
    Ok(url.to_string())
}

fn valid_fingerprint(value: &str) -> bool {
    value.len() == 64 && value.bytes().all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
}

fn encode(manager: &ModuleManager) -> Result<Vec<u8>, &'static str> {
    let snapshot = Snapshot {
        version: 1,
        repositories: manager.repositories.iter().cloned().collect(),
        modules: manager.staged.values().map(|row| SavedModule {
            entry: row.entry.clone(),
            fingerprint: row.fingerprint.clone(),
            format: row.format,
        }).collect(),
    };
    let bytes = serde_json::to_vec(&snapshot).map_err(|_| "state-encode")?;
    if bytes.len() > MAX_STATE { return Err("state-limit"); }
    Ok(bytes)
}

fn decode(bytes: &[u8]) -> Result<ModuleManager, &'static str> {
    if bytes.len() > MAX_STATE { return Err("state-limit"); }
    let snapshot: Snapshot = serde_json::from_slice(bytes).map_err(|_| "invalid-state")?;
    if snapshot.version != 1 { return Err("state-version"); }
    if snapshot.repositories.len() > MAX_REPOSITORIES || snapshot.modules.len() > MAX_INSTALLED {
        return Err("state-limit");
    }
    let mut manager = ModuleManager::default();
    for repo in snapshot.repositories {
        if repository_index(&repo)? != repo || !manager.repositories.insert(repo) {
            return Err("invalid-state");
        }
    }
    for row in snapshot.modules {
        let original = &row.entry;
        let repository = approved_url(&original.key.repository, None)?;
        let canonical = entry(&repository, &serde_json::json!({
            "id": original.key.id, "name": original.name, "version": original.version,
            "download": original.download, "author": original.author
        }))?;
        if &canonical != original || !valid_fingerprint(&row.fingerprint)
            || manager.staged.contains_key(&original.key)
        {
            return Err("invalid-state");
        }
        let generation = manager.next_generation()?;
        manager.staged.insert(row.entry.key.clone(), StagedModule {
            entry: row.entry, fingerprint: row.fingerprint, format: row.format,
            enabled: false, hosts: BTreeSet::new(), generation, verified: false,
        });
    }
    Ok(manager)
}

fn state_path(root: &Path) -> Result<PathBuf, &'static str> {
    // The caller must own this directory and its ancestors; this is not a defense
    // against another local process with write access to that directory.
    if !root.is_absolute() { return Err("state-directory"); }
    let meta = fs::symlink_metadata(root).map_err(|_| "state-directory")?;
    if !meta.file_type().is_dir() || meta.file_type().is_symlink() {
        return Err("state-directory");
    }
    let path = root.join(STATE_FILE);
    match fs::symlink_metadata(&path) {
        Ok(meta) if !meta.file_type().is_file() || meta.file_type().is_symlink() => Err("state-file"),
        Ok(_) => Ok(path),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(path),
        Err(_) => Err("state-file"),
    }
}

/// A missing snapshot is a new catalog. Corrupt or unsupported snapshots fail closed.
pub fn load_state(root: &Path) -> Result<ModuleManager, &'static str> {
    let path = state_path(root)?;
    let file = match File::open(path) {
        Ok(file) => file,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(ModuleManager::default()),
        Err(_) => return Err("state-read"),
    };
    let mut bytes = Vec::new();
    file.take((MAX_STATE + 1) as u64).read_to_end(&mut bytes).map_err(|_| "state-read")?;
    decode(&bytes)
}

/// Single trusted host writer. Write a bounded same-directory temporary file,
/// sync it and atomically replace the old snapshot (no delete-then-rename).
/// Does not promise power-loss durability of the directory entry on every OS.
pub fn save_state(root: &Path, manager: &ModuleManager) -> Result<(), &'static str> {
    let path = state_path(root)?;
    let bytes = encode(manager)?;
    let mut temp = tempfile::NamedTempFile::new_in(root).map_err(|_| "state-write")?;
    temp.write_all(&bytes).map_err(|_| "state-write")?;
    temp.as_file().sync_all().map_err(|_| "state-write")?;
    temp.persist(path).map_err(|_| "state-replace")?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    const URL: &str = "https://modules.example.com/index.json";
    const JS: &[u8] = b"return { searchTracks() { return { tracks: [], total: 0 }; } };";
    fn catalog_entry() -> CatalogEntry {
        let raw = json!({"category:modules":[{
            "type":"MODULE","id":"fixture","name":"Fixture","version":"1","download":"test.8spine"
        }]});
        parse_catalog(URL, raw.to_string().as_bytes()).unwrap().remove(0)
    }

    #[test]
    fn repository_urls_are_canonical_bounded_and_removal_revokes() {
        let mut manager = ModuleManager::default();
        assert_eq!(manager.add_repository("https://modules.example.com/"), Ok(URL.to_owned()));
        assert_eq!(manager.add_repository("https://modules.example.com"), Ok(URL.to_owned()));
        assert_eq!(manager.add_repository(URL), Ok(URL.to_owned()));
        assert_eq!(manager.repositories().count(), 1);
        for invalid in ["http://modules.example.com/", "https://127.0.0.1/", "https://user@modules.example.com/", "https://modules.example.com/index.json?token=secret"] {
            assert!(manager.add_repository(invalid).is_err(), "{invalid}");
        }
        assert_eq!(manager.add_repository("https://modules.example.com/music"), Ok("https://modules.example.com/music/index.json".to_owned()));
        let row = catalog_entry();
        manager.stage(&row, JS).unwrap();
        let hash = manager.get(&row.key).unwrap().fingerprint().to_owned();
        manager.approve(&row.key, &hash, &["api.example.com"]).unwrap();
        let permit = manager.permit(&row.key, JS).unwrap();
        assert_eq!(manager.remove_repository("https://modules.example.com/"), Ok(true));
        assert!(manager.get(&row.key).is_none());
        assert_eq!(manager.network_grant(&permit).err(), Some("revoked"));
        assert_eq!(manager.repositories().count(), 1);
    }

    #[test]
    fn state_round_trip_restarts_disabled_and_revokes_old_permits() {
        let tmp = tempfile::tempdir().unwrap();
        let root = tmp.path();
        let mut manager = load_state(root).unwrap();
        manager.add_repository(URL).unwrap();
        let row = catalog_entry();
        manager.stage(&row, JS).unwrap();
        let hash = manager.get(&row.key).unwrap().fingerprint().to_owned();
        manager.approve(&row.key, &hash, &["api.example.com"]).unwrap();
        let old_permit = manager.permit(&row.key, JS).unwrap();
        save_state(root, &manager).unwrap();
        let saved = fs::read_to_string(root.join(STATE_FILE)).unwrap();
        assert!(!saved.contains("api.example.com"));
        assert!(!saved.contains("\"enabled\""));
        assert!(!saved.contains("searchTracks"));
        let mut restored = load_state(root).unwrap();
        assert_eq!(restored.repositories().collect::<Vec<_>>(), vec![URL]);
        assert_eq!(restored.modules().count(), 1);
        assert_eq!(restored.get(&row.key).unwrap().fingerprint(), hash);
        assert!(!restored.get(&row.key).unwrap().enabled());
        assert_eq!(restored.approve(&row.key, &hash, &["api.example.com"]), Err("package-not-verified"));
        assert_eq!(restored.permit(&row.key, JS).err(), Some("disabled"));
        restored.stage(&row, JS).unwrap();
        restored.approve(&row.key, &hash, &["api.example.com"]).unwrap();
        let new_permit = restored.permit(&row.key, JS).unwrap();
        assert!(restored.network_grant(&new_permit).is_ok());
        assert_eq!(restored.network_grant(&old_permit).err(), Some("revoked"));
        restored.remove_repository(URL).unwrap();
        save_state(root, &restored).unwrap();
        let final_state = load_state(root).unwrap();
        assert_eq!(final_state.modules().count(), 0);
        assert_eq!(final_state.repositories().count(), 0);
    }

    #[test]
    fn corrupted_oversized_privileged_or_duplicate_state_is_rejected() {
        let tmp = tempfile::tempdir().unwrap();
        let path = tmp.path().join(STATE_FILE);
        for (data, expected) in [
            ("{", "invalid-state"),
            (r#"{"version":2,"repositories":[],"modules":[]}"#, "state-version"),
            (r#"{"version":1,"repositories":[],"modules":[],"enabled":true}"#, "invalid-state"),
            (r#"{"version":1,"repositories":["https://modules.example.com/index.json","https://modules.example.com/index.json"],"modules":[]}"#, "invalid-state"),
        ] {
            fs::write(&path, data).unwrap();
            assert_eq!(load_state(tmp.path()).err(), Some(expected));
            assert_eq!(fs::read_to_string(&path).unwrap(), data);
        }
        fs::write(&path, vec![b'x'; MAX_STATE + 1]).unwrap();
        assert_eq!(load_state(tmp.path()).err(), Some("state-limit"));
        let mut manager = ModuleManager::default();
        manager.stage(&catalog_entry(), JS).unwrap();
        let mut snapshot: Value = serde_json::from_slice(&encode(&manager).unwrap()).unwrap();
        snapshot["modules"][0]["enabled"] = json!(true);
        assert_eq!(decode(snapshot.to_string().as_bytes()).err(), Some("invalid-state"));
        snapshot["modules"][0].as_object_mut().unwrap().remove("enabled");
        snapshot["modules"][0]["fingerprint"] = json!("not-a-hash");
        assert_eq!(decode(snapshot.to_string().as_bytes()).err(), Some("invalid-state"));
    }

    #[test]
    fn invalid_destination_does_not_replace_directory_or_follow_symlink() {
        let tmp = tempfile::tempdir().unwrap();
        let path = tmp.path().join(STATE_FILE);
        fs::create_dir(&path).unwrap();
        assert_eq!(save_state(tmp.path(), &ModuleManager::default()), Err("state-file"));
        assert!(path.is_dir());
        #[cfg(unix)]
        {
            fs::remove_dir(&path).unwrap();
            let other = tmp.path().join("unrelated.json");
            fs::write(&other, "untouched").unwrap();
            std::os::unix::fs::symlink(&other, &path).unwrap();
            assert_eq!(save_state(tmp.path(), &ModuleManager::default()), Err("state-file"));
            assert_eq!(load_state(tmp.path()).err(), Some("state-file"));
            assert_eq!(fs::read_to_string(other).unwrap(), "untouched");
        }
    }

    #[test]
    fn repository_capacity_is_enforced() {
        let mut manager = ModuleManager::default();
        for i in 0..MAX_REPOSITORIES {
            manager.add_repository(&format!("https://repo{i}.example.com/")).unwrap();
        }
        assert_eq!(manager.add_repository("https://extra.example.com/"), Err("repository-limit"));
    }
}
