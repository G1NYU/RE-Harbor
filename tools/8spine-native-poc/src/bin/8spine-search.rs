//! Trusted host-side process; the JavaScript executes only in the OS-isolated worker.
use harbor_8spine_native_poc::module_manager::{CatalogEntry, ModuleManager};
use serde::Deserialize;
use serde_json::{json, Value};
use std::{io::{self, Read}, time::Duration};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Search {
    entry: CatalogEntry,
    fingerprint: String,
    hosts: Vec<String>,
    package: String,
    query: Option<String>,
    limit: Option<usize>,
    track_id: Option<Value>,
    quality: Option<String>,
}

#[cfg(any(target_os = "linux", windows))]
async fn run(input: Search) -> Result<Value, &'static str> {
    let dir = std::env::current_exe().map_err(|_| "runtime-unavailable")?;
    let dir = dir.parent().ok_or("runtime-unavailable")?;
    let mut manager = ModuleManager::default();
    let bytes = input.package.as_bytes();
    manager.stage(&input.entry, bytes)?;
    let hosts = input.hosts.iter().map(String::as_str).collect::<Vec<_>>();
    manager.approve(&input.entry.key, &input.fingerprint, &hosts)?;
    let permit = manager.permit(&input.entry.key, bytes)?;
    #[cfg(target_os = "linux")]
    let worker = harbor_8spine_native_poc::supervisor::Supervisor::new(
        &dir.join("harbor-8spine-native-poc"), Duration::from_secs(5),
        harbor_8spine_native_poc::supervisor::Isolation::LinuxNamespace)?;
    #[cfg(windows)]
    let worker = harbor_8spine_native_poc::supervisor::WindowsFixtureSupervisor::new(
        &dir.join("harbor-8spine-native-poc.exe"), &dir.join("8spine-sandbox.exe"))?;
    match (input.query, input.limit, input.track_id) {
        (Some(query), Some(limit), None) if input.quality.is_none() => worker.run_approved_search(&manager, &permit, bytes, &query, limit).await,
        (None, None, Some(track_id)) => worker.run_approved_resolve(&manager, &permit, bytes, &track_id, input.quality.as_deref().unwrap_or("HIGH")).await,
        _ => Err("invalid-request"),
    }
}

#[cfg(not(any(target_os = "linux", windows)))]
async fn run(_: Search) -> Result<Value, &'static str> { Err("sandbox-unavailable") }

fn main() {
    let result = (|| {
        let mut bytes = Vec::new();
        io::stdin().lock().take(2 * 1024 * 1024 + 1).read_to_end(&mut bytes).map_err(|_| "input-error")?;
        if bytes.len() > 2 * 1024 * 1024 { return Err("input-limit"); }
        let input: Search = serde_json::from_slice(&bytes).map_err(|_| "invalid-request")?;
        if input.package.len() > 128 * 1024 { return Err("input-limit"); }
        let runtime = tokio::runtime::Builder::new_current_thread().enable_all().build().map_err(|_| "runtime-init")?;
        let result = runtime.block_on(run(input));
        runtime.shutdown_timeout(Duration::from_secs(1));
        result
    })();
    match result {
        Ok(result) => println!("{}", json!({"ok":true,"result":result})),
        Err(error) => println!("{}", json!({"ok":false,"error":error})),
    }
}
