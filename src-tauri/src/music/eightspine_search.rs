//! Opt-in experimental search-only connectors. No external module code in Harbor's process.
use super::{connector::{ConnectorHealth, MusicConnector}, MusicState, MusicStream, MusicTrack};
use super::eightspine_catalog::{catalog::CatalogEntry, http_transport::NetworkGrant, retrieve_package, verify_plain};
use async_trait::async_trait;
use serde::Serialize;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::{collections::BTreeMap, path::PathBuf, process::Stdio, sync::{Arc, Mutex, atomic::{AtomicBool, Ordering}}, time::Duration};
use tauri::Manager;
use tokio::io::{AsyncReadExt, AsyncWriteExt};

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct SourceStatus {
    entry: CatalogEntry,
    connector_id: String,
    fingerprint: String,
}

struct Active {
    status: SourceStatus,
    enabled: Arc<AtomicBool>,
}

#[derive(Default)]
pub(super) struct ActiveSources(Mutex<BTreeMap<String, Active>>);

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeStatus {
    available: bool,
    active: Vec<SourceStatus>,
}

fn runtime(app: &tauri::AppHandle) -> Option<PathBuf> {
    if !cfg!(any(target_os = "linux", windows)) { return None; }
    let root = app.path().resource_dir().ok()?.join("8spine");
    let suffix = if cfg!(windows) { ".exe" } else { "" };
    let host = root.join(format!("8spine-search{suffix}"));
    let worker = root.join(format!("harbor-8spine-native-poc{suffix}"));
    if !host.is_file() || !worker.is_file() { return None; }
    if cfg!(windows) && !root.join("8spine-sandbox.exe").is_file() { return None; }
    if cfg!(target_os = "linux") && !std::path::Path::new("/usr/bin/bwrap").is_file() { return None; }
    Some(host)
}

fn id(entry: &CatalogEntry) -> String {
    let key = serde_json::to_vec(&entry.key).expect("serializable module key");
    format!("8spine-{:x}", Sha256::digest(key))
}

#[tauri::command]
pub fn music_8spine_runtime_status(app: tauri::AppHandle, state: tauri::State<'_, MusicState>) -> Result<RuntimeStatus, String> {
    let guard = state.eightspine.0.lock().map_err(|_| "source-state")?;
    Ok(RuntimeStatus { available: runtime(&app).is_some(), active: guard.values().map(|a| a.status.clone()).collect() })
}

#[tauri::command]
pub async fn music_8spine_enable(app: tauri::AppHandle, state: tauri::State<'_, MusicState>,
    entry: CatalogEntry, fingerprint: String, hosts: Vec<String>) -> Result<String, String> {
    let runner = runtime(&app).ok_or("sandbox-unavailable")?;
    let host_refs = hosts.iter().map(String::as_str).collect::<Vec<_>>();
    NetworkGrant::new(&entry.key.id, &fingerprint, &host_refs)?;
    let bytes = retrieve_package(&entry).await?;
    if bytes.len() > 128 * 1024 || format!("{:x}", Sha256::digest(&bytes)) != fingerprint {
        return Err("package-changed-or-too-large".to_owned());
    }
    verify_plain(&bytes)?;
    let package = String::from_utf8(bytes).map_err(|_| "unsupported-package")?;
    let connector_id = id(&entry);
    let mut guard = state.eightspine.0.lock().map_err(|_| "source-state")?;
    if guard.len() >= 8 || guard.contains_key(&connector_id) { return Err("source-limit-or-already-enabled".to_owned()); }
    let enabled = Arc::new(AtomicBool::new(true));
    let status = SourceStatus { entry: entry.clone(), connector_id: connector_id.clone(), fingerprint: fingerprint.clone() };
    state.registry.register(Box::new(SearchConnector {
        connector_id: connector_id.clone(), entry, fingerprint, hosts, package, runner,
        enabled: enabled.clone(), busy: tokio::sync::Mutex::new(()),
    }))?;
    guard.insert(connector_id.clone(), Active { status, enabled });
    Ok(connector_id)
}

fn disable(state: &MusicState, connector_id: &str, active: &mut BTreeMap<String, Active>) -> Result<(), String> {
    if let Some(item) = active.get(connector_id) {
        item.enabled.store(false, Ordering::Release);
        state.registry.remove_8spine(connector_id)?;
        active.remove(connector_id);
    }
    Ok(())
}

#[tauri::command]
pub fn music_8spine_disable(state: tauri::State<'_, MusicState>, connector_id: String) -> Result<(), String> {
    let mut guard = state.eightspine.0.lock().map_err(|_| "source-state")?;
    disable(&state, &connector_id, &mut guard)
}

#[tauri::command]
pub fn music_8spine_disable_repository(state: tauri::State<'_, MusicState>, repository: String) -> Result<(), String> {
    let mut guard = state.eightspine.0.lock().map_err(|_| "source-state")?;
    let ids = guard.iter().filter(|(_, a)| a.status.entry.key.repository == repository)
        .map(|(id, _)| id.clone()).collect::<Vec<_>>();
    for id in ids { disable(&state, &id, &mut guard)?; }
    Ok(())
}

struct SearchConnector {
    connector_id: String,
    entry: CatalogEntry,
    fingerprint: String,
    hosts: Vec<String>,
    package: String,
    runner: PathBuf,
    enabled: Arc<AtomicBool>,
    busy: tokio::sync::Mutex<()>,
}

impl SearchConnector {
    async fn tracks(&self, query: &str, limit: usize) -> Result<Vec<MusicTrack>, String> {
        let _guard = self.busy.try_lock().map_err(|_| "source-busy")?;
        if !self.enabled.load(Ordering::Acquire) { return Err("source-disabled".to_owned()); }
        let limit = limit.clamp(1, 50);
        let payload = serde_json::to_vec(&json!({"entry":self.entry,"fingerprint":self.fingerprint,
            "hosts":self.hosts,"package":self.package,"query":query,"limit":limit})).map_err(|_| "invalid-request")?;
        if payload.len() > 2 * 1024 * 1024 { return Err("input-limit".to_owned()); }
        let mut command = tokio::process::Command::new(&self.runner);
        command.env_clear().stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::null()).kill_on_drop(true);
        #[cfg(windows)]
        {
            command.creation_flags(0x08000000);
            for key in ["SystemRoot", "LOCALAPPDATA", "USERPROFILE"] {
                command.env(key, std::env::var_os(key).ok_or("sandbox-unavailable")?);
            }
        }
        let mut child = command.spawn().map_err(|_| "runtime-spawn")?;
        let mut stdin = child.stdin.take().ok_or("runtime-input")?;
        let stdout = child.stdout.take().ok_or("runtime-output")?;
        let mut out = Vec::new();
        tokio::time::timeout(Duration::from_secs(28), async {
            stdin.write_all(&payload).await.map_err(|_| "runtime-input")?;
            drop(stdin);
            stdout.take(256 * 1024 + 1).read_to_end(&mut out).await.map_err(|_| "runtime-output")?;
            if out.len() > 256 * 1024 || !child.wait().await.map_err(|_| "runtime-exit")?.success() {
                return Err("runtime-output");
            }
            Ok::<(), &'static str>(())
        }).await.map_err(|_| "runtime-timeout")??;
        if !self.enabled.load(Ordering::Acquire) { return Err("source-disabled".to_owned()); }
        let reply: Value = serde_json::from_slice(&out).map_err(|_| "runtime-output")?;
        if reply["ok"] != true { return Err("8SPINE source search failed".to_owned()); }
        let rows = reply["result"]["tracks"].as_array().ok_or("invalid-tracks")?;
        if rows.len() > limit { return Err("invalid-tracks".to_owned()); }
        rows.iter().map(|row| {
            let source_id = serde_json::to_string(&row["id"]).map_err(|_| "invalid-track")?;
            let title = row["title"].as_str().ok_or("invalid-title")?;
            let artist = row["artist"].as_str().ok_or("invalid-artist")?;
            let duration = row["duration"].as_f64().filter(|n| *n > 0.0 && *n <= 86400.0).ok_or("invalid-duration")? as u64;
            Ok(MusicTrack {
                id: format!("{}:{:x}",self.connector_id,Sha256::digest(source_id.as_bytes())),
                connector_id: Some(self.connector_id.clone()), source_id: Some(source_id),
                playback_url: None, title: title.to_owned(), artist: artist.to_owned(), album: None,
                artwork: String::new(), duration_seconds: duration, duration_label: super::duration_label(duration),
                explicit: None, version: None, media_kind: None,
            })
        }).collect()
    }
}

#[async_trait]
impl MusicConnector for SearchConnector {
    fn id(&self) -> &str { &self.connector_id }
    fn name(&self) -> &str { &self.entry.name }
    fn health(&self) -> ConnectorHealth { if self.enabled.load(Ordering::Acquire) { ConnectorHealth::Unknown } else { ConnectorHealth::Offline } }
    fn searchable(&self) -> bool { self.enabled.load(Ordering::Acquire) }
    fn playable(&self) -> bool { false }
    async fn search(&self, _: &tauri::AppHandle, query: &str, limit: usize) -> Result<Vec<MusicTrack>, String> { self.tracks(query, limit).await }
    async fn resolve(&self, _: &tauri::AppHandle, _: &MusicTrack) -> Result<MusicStream, String> { Err("8SPINE playback is not available yet".to_owned()) }
}
