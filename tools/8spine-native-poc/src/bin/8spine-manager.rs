//! Host-side development CLI. Manages metadata only; never runs module code.
use harbor_8spine_native_poc::module_manager::{
    load_state, save_state, ModuleKey, ModuleManager, repository_import::CatalogFetch,
};
use serde_json::{json, Value};
use std::{fs::{self, OpenOptions}, path::{Path, PathBuf}, time::Duration};

struct StateLock(PathBuf);
impl StateLock {
    fn acquire(root: &Path) -> Result<Self, &'static str> {
        if !root.is_absolute() { return Err("state-directory"); }
        let metadata = fs::symlink_metadata(root).map_err(|_| "state-directory")?;
        if !metadata.is_dir() || metadata.file_type().is_symlink() {
            return Err("state-directory");
        }
        let path = root.join("8spine-manager.lock");
        OpenOptions::new().write(true).create_new(true).open(&path)
            .map_err(|_| "state-lock")?;
        Ok(Self(path))
    }
}
impl Drop for StateLock {
    fn drop(&mut self) { let _ = fs::remove_file(&self.0); }
}

fn snapshot(manager: &ModuleManager) -> Value {
    let repositories: Vec<_> = manager.repositories().collect();
    let modules: Vec<_> = manager.modules().map(|m| json!({
        "entry": m.entry(),
        "fingerprint": m.fingerprint(),
        "format": m.format(),
        "verified": m.verified(),
        "status": m.status(),
        "approvedHosts": m.hosts().collect::<Vec<_>>(),
        "executionAvailable": false
    })).collect();
    json!({"repositories":repositories,"modules":modules,"executionAvailable":false})
}

async fn run(root: &Path, args: &[String]) -> Result<Value, &'static str> {
    let _lock = StateLock::acquire(root)?;
    let mut manager = load_state(root)?;
    match args {
        [command] if command == "list" => Ok(snapshot(&manager)),
        [command, url] if command == "add" => {
            manager.add_repository(url)?;
            save_state(root, &manager)?;
            Ok(snapshot(&manager))
        }
        [command, url] if command == "remove-repository" => {
            manager.remove_repository(url)?;
            save_state(root, &manager)?;
            Ok(snapshot(&manager))
        }
        [command, repository, id] if command == "remove-module" => {
            // Use the exact canonical key returned by browse/list.
            let key = ModuleKey { repository: repository.clone(), id: id.clone() };
            if !manager.remove(&key) { return Err("not-staged"); }
            save_state(root, &manager)?;
            Ok(snapshot(&manager))
        }
        [command, repository] if command == "browse" => {
            let catalog = CatalogFetch::prepare(&manager, repository)?
                .fetch_live(&manager).await?;
            Ok(json!({"entries":catalog.entries(),"executionAvailable":false}))
        }
        [command, repository, id, version, exact_url] if command == "inspect" => {
            // An explicit command names the exact URL presented to the user
            // by browse. Refetch the catalog and refuse changed selection.
            let catalog = CatalogFetch::prepare(&manager, repository)?
                .fetch_live(&manager).await?;
            let row = catalog.entries().iter().find(|row| &row.key.id == id)
                .ok_or("catalog-entry-missing")?;
            if &row.version != version { return Err("catalog-version-changed"); }
            let key = row.key.clone();
            let fetch = catalog.prepare_package(&manager, &key, exact_url)?;
            fetch.fetch_and_stage_live(&mut manager).await?;
            save_state(root, &manager)?;
            Ok(snapshot(&manager))
        }
        _ => Err("invalid-command"),
    }
}

fn main() {
    // The caller chooses an existing trusted, private directory. No arbitrary
    // command execution, package persistence or execution grants are accepted.
    let args: Vec<_> = std::env::args().skip(1).collect();
    let result = if args.len() < 2 {
        Err("usage: 8spine-manager <absolute-state-directory> <list|add|browse|inspect|remove-module|remove-repository> [arguments]; inspect requires repository, id, version, exact URL")
    } else {
        match tokio::runtime::Builder::new_current_thread().enable_all().build() {
            Ok(runtime) => {
                let result = runtime.block_on(run(Path::new(&args[0]), &args[1..]));
                runtime.shutdown_timeout(Duration::from_secs(1));
                result
            }
            Err(_) => Err("runtime-init"),
        }
    };
    match result {
        Ok(data) => println!("{}", json!({"ok":true,"result":data})),
        Err(error) => {
            println!("{}", json!({"ok":false,"error":error}));
            std::process::exit(1);
        }
    }
}
