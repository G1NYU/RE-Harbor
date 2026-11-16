//! Opt-in experimental connector search and bounded audio playback. No external module code in Harbor's process.
use super::{connector::{ConnectorHealth, MusicConnector}, MusicState, MusicStream, MusicTrack};
use super::eightspine_catalog::{catalog::CatalogEntry, http_transport::{NetworkGrant, NetworkSession}, retrieve_package, verify_plain};
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
    playback: bool,
    quality: String,
}

struct Active {
    status: SourceStatus,
    enabled: Arc<AtomicBool>,
}

#[derive(Default)]
pub(super) struct ActiveSources(Mutex<BTreeMap<String, Active>>, Mutex<Vec<PathBuf>>);

impl Drop for ActiveSources {
    fn drop(&mut self) {
        if let Ok(files) = self.1.get_mut() {
            for path in files.drain(..) { let _ = std::fs::remove_file(path); }
        }
    }
}

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
    entry: CatalogEntry, fingerprint: String, hosts: Vec<String>, playback: bool, quality: String) -> Result<String, String> {
    if !matches!(quality.as_str(), "LOW" | "HIGH" | "LOSSLESS") { return Err("invalid-quality".to_owned()); }
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
    let status = SourceStatus { entry: entry.clone(), connector_id: connector_id.clone(), fingerprint: fingerprint.clone(), playback, quality: quality.clone() };
    state.registry.register(Box::new(SearchConnector {
        connector_id: connector_id.clone(), entry, fingerprint, hosts, package, runner,
        enabled: enabled.clone(), playback, quality, busy: tokio::sync::Mutex::new(()),
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
    playback: bool,
    quality: String,
    busy: tokio::sync::Mutex<()>,
}

impl SearchConnector {
    async fn invoke_runtime(&self, operation: Value) -> Result<Value, String> {
        if !self.enabled.load(Ordering::Acquire) { return Err("source-disabled".to_owned()); }
        let mut request = json!({"entry":self.entry,"fingerprint":self.fingerprint,
            "hosts":self.hosts,"package":self.package});
        request.as_object_mut().ok_or("invalid-request")?.extend(operation.as_object().ok_or("invalid-request")?.clone());
        let payload = serde_json::to_vec(&request).map_err(|_| "invalid-request")?;
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
        Ok(reply["result"].clone())
    }

    async fn tracks(&self, query: &str, limit: usize) -> Result<Vec<MusicTrack>, String> {
        let _guard = self.busy.try_lock().map_err(|_| "source-busy")?;
        let limit = limit.clamp(1, 50);
        let result = self.invoke_runtime(json!({"query":query,"limit":limit})).await?;
        let rows = result["tracks"].as_array().ok_or("invalid-tracks")?;
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
    fn playable(&self) -> bool { self.playback && self.enabled.load(Ordering::Acquire) }
    async fn search(&self, _: &tauri::AppHandle, query: &str, limit: usize) -> Result<Vec<MusicTrack>, String> { self.tracks(query, limit).await }
    async fn resolve(&self, app: &tauri::AppHandle, track: &MusicTrack) -> Result<MusicStream, String> {
        if !self.playable() || track.connector_id.as_deref() != Some(self.connector_id.as_str()) {
            return Err("8SPINE playback is disabled".to_owned());
        }
        let _guard = self.busy.try_lock().map_err(|_| "source-busy")?;
        let raw_id = track.source_id.as_deref().ok_or("invalid-track")?;
        if raw_id.len() > 4096 || track.id != format!("{}:{:x}", self.connector_id, Sha256::digest(raw_id.as_bytes())) {
            return Err("invalid-track".to_owned());
        }
        let id: Value = serde_json::from_str(raw_id).map_err(|_| "invalid-track")?;
        let resolved = self.invoke_runtime(json!({"trackId":id,"quality":self.quality})).await?;
        let url = resolved["streamUrl"].as_str().ok_or("invalid-stream")?;
        // Bound memory across all enabled connectors; catalog calls retain
        // their own small response ceilings.
        let _download = AUDIO_DOWNLOAD.lock().await;
        if !self.enabled.load(Ordering::Acquire) { return Err("source-disabled".to_owned()); }
        let bytes = download_audio(&self.entry.key.id, &self.fingerprint, &self.hosts, url).await?;
        let format = audio_format(&bytes).ok_or("unsupported-audio-format")?;
        if !self.enabled.load(Ordering::Acquire) { return Err("source-disabled".to_owned()); }
        let state = app.state::<MusicState>();
        let dir = app.path().app_cache_dir().map_err(|_| "audio-cache")?.join("8spine-audio");
        std::fs::create_dir_all(&dir).map_err(|_| "audio-cache")?;
        let meta = std::fs::symlink_metadata(&dir).map_err(|_| "audio-cache")?;
        if !meta.is_dir() || meta.file_type().is_symlink() { return Err("audio-cache".to_owned()); }
        let mut files = state.eightspine.1.lock().map_err(|_| "audio-cache")?;
        let used: u64 = files.iter().filter_map(|p| std::fs::metadata(p).ok().map(|m| m.len())).sum();
        if files.len() >= 64 || used.saturating_add(bytes.len() as u64) > 512 * 1024 * 1024 {
            return Err("session audio cache full; restart Harbor".to_owned());
        }
        let path = dir.join(format!("{}.{}", uuid::Uuid::new_v4(), format.extension));
        use std::io::Write;
        let mut file = std::fs::OpenOptions::new().write(true).create_new(true).open(&path).map_err(|_| "audio-cache")?;
        if file.write_all(&bytes).is_err() {
            drop(file);
            let _ = std::fs::remove_file(&path);
            return Err("audio-cache".to_owned());
        }
        drop(file);
        let url = match path.to_str() { Some(s) => s.to_owned(), None => { let _ = std::fs::remove_file(&path); return Err("audio-cache".to_owned()); } };
        files.push(path);
        Ok(MusicStream { url, mime_type: format.mime.to_owned(), bitrate: 0, http_headers: Default::default() })
    }
}

 static AUDIO_DOWNLOAD: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());

 // Direct audio only: no HLS, playlists, arbitrary mpv URLs,
 // redirects, request headers or files selected by the module.
 async fn download_audio(module: &str, fingerprint: &str, hosts: &[String], url: &str) -> Result<Vec<u8>, String> {
     let refs = hosts.iter().map(String::as_str).collect::<Vec<_>>();
     let grant = NetworkGrant::new(module, fingerprint, &refs)?;
     let mut session = NetworkSession::new(&grant, module, fingerprint)?;
     let (status, bytes) = session.authorize("GET", url)?.send_audio_bytes().await?;
     if status != 200 || audio_format(&bytes).is_none() { return Err("Unsupported direct audio or invalid response".to_owned()); }
     Ok(bytes)
 }

 #[derive(Clone, Copy, Debug, PartialEq, Eq)]
 struct AudioFormat { extension: &'static str, mime: &'static str }

 fn audio_format(bytes: &[u8]) -> Option<AudioFormat> {
     let format = |extension, mime| Some(AudioFormat { extension, mime });
     // Only recognize known direct audio signatures, never trust a URL
     // extension, MIME supplied by a module or an arbitrary playlist.
     if bytes.starts_with(b"fLaC") && bytes.len() >= 42 && bytes[4] & 0x7f == 0
         && bytes[5..8] == [0, 0, 34] {
         return format("flac", "audio/flac");
     }
     if bytes.len() >= 35 && &bytes[..5] == b"OggS\0" && bytes[5] == 2 {
         let segments = bytes[26] as usize;
         let offset = 27 + segments;
         if segments > 0 && bytes[27] >= 30 && bytes.get(offset..offset + 7) == Some(b"\x01vorbis".as_slice()) {
             return format("ogg", "audio/ogg");
         }
         if segments > 0 && bytes[27] >= 19 && bytes.get(offset..offset + 8) == Some(b"OpusHead".as_slice()) {
             return format("opus", "audio/ogg");
         }
     }
     // ID3 is metadata, not proof of audio. Check the actual frame following
     // the size-bounded, synchsafe tag. Never interpret ID3 payload as a URL.
     let data = if bytes.starts_with(b"ID3") {
         let header = bytes.get(..10)?;
         if !matches!(header[3], 2..=4) || header[6..10].iter().any(|b| b & 0x80 != 0) { return None; }
         let size = header[6..10].iter().fold(0usize, |n, b| (n << 7) | usize::from(*b));
         let footer = if header[3] == 4 && header[5] & 0x10 != 0 { 10 } else { 0 };
         bytes.get(10 + size + footer..)?
     } else { bytes };
     let header = data.get(..7)?;
     if header[0] != 0xff { return None; }
     // AAC ADTS: valid sync, layer, sample-frequency index and frame bounds.
     if header[1] & 0xf6 == 0xf0 && ((header[2] >> 2) & 15) < 13 {
         let length = (usize::from(header[3] & 3) << 11) | (usize::from(header[4]) << 3) | usize::from(header[5] >> 5);
         let min = if header[1] & 1 == 0 { 9 } else { 7 };
         if length >= min && length <= data.len() { return format("aac", "audio/aac"); }
     }
     // MPEG Layer III: reject reserved version, sample rate and bitrate.
     if header[1] & 0xe0 == 0xe0 && (header[1] >> 3) & 3 != 1
         && (header[1] >> 1) & 3 == 1 && (1..=14).contains(&(header[2] >> 4))
         && (header[2] >> 2) & 3 != 3 {
         let version = (header[1] >> 3) & 3;
         let rate_index = usize::from(header[2] >> 4);
         let rate = if version == 3 {
             [0,32,40,48,56,64,80,96,112,128,160,192,224,256,320][rate_index]
         } else { [0,8,16,24,32,40,48,56,64,80,96,112,128,144,160][rate_index] };
         let base = [44100,48000,32000][usize::from((header[2] >> 2) & 3)];
         let sample_rate = if version == 3 { base } else if version == 2 { base / 2 } else { base / 4 };
         let coefficient = if version == 3 { 144000 } else { 72000 };
         let length = coefficient * rate / sample_rate + usize::from((header[2] >> 1) & 1);
         if length >= 7 && length <= data.len() { return format("mp3", "audio/mpeg"); }
     }
     None
 }

 #[cfg(test)]
 mod tests {
     use super::*;
     #[tokio::test]
     #[ignore = "explicit public-domain audio download and libmpv playback"]
     async fn public_domain_audio_playback() {
         use libmpv2::{events::{Event, EventContext}, Mpv};
         use std::time::Instant;
         let bytes = download_audio("commons-public-domain", "1", &["upload.wikimedia.org".to_owned()],
             "https://upload.wikimedia.org/wikipedia/commons/d/d4/Carl_Philipp_Emanuel_Bach_-_Solfeggietto.ogg").await.unwrap();
         let path = std::env::temp_dir().join(format!("8spine-licensed-{}.ogg", uuid::Uuid::new_v4()));
         struct Cleanup(PathBuf);
         impl Drop for Cleanup { fn drop(&mut self) { let _ = std::fs::remove_file(&self.0); } }
         let _cleanup = Cleanup(path.clone());
         std::fs::write(&path, bytes).unwrap();
         let mpv = Mpv::with_initializer(|init| {
             for (key, value) in [("ao","null"),("vo","null"),("terminal","no"),
                 ("idle","yes"),("keep-open","yes"),("pause","yes")] { init.set_property(key,value)?; }
             Ok(())
         }).expect("headless player");
         let mut events = EventContext::new(mpv.ctx);
         crate::mpv::mpv_argv_command(&mpv, &["loadfile", path.to_str().unwrap(), "replace"]).unwrap();
         let deadline = Instant::now() + Duration::from_secs(10);
         loop {
             if matches!(events.wait_event(0.0), Some(Ok(Event::FileLoaded))) { break; }
             assert!(Instant::now() < deadline, "licensed audio failed to load");
             tokio::time::sleep(Duration::from_millis(10)).await;
         }
         let duration = mpv.get_property::<f64>("duration").unwrap();
         assert!((duration - 63.72).abs() < 1.0, "decoded duration {duration}");
         mpv.set_property("pause", false).unwrap();
         let deadline = Instant::now() + Duration::from_secs(5);
         while mpv.get_property::<f64>("time-pos").unwrap_or(0.0) < 0.25 {
             assert!(Instant::now() < deadline, "public-domain music playback did not advance");
             tokio::time::sleep(Duration::from_millis(10)).await;
         }
         drop(events);
         drop(mpv);
     }

     #[test]
     fn audio_signature_denies_non_audio_and_truncated_headers() {
         assert!(audio_format(b"#EXTM3U\nfile:///private").is_none());
         assert!(audio_format(b"OggS").is_none());
         let mut bytes = vec![0; 64];
         bytes[..5].copy_from_slice(b"OggS\0");
         bytes[5] = 2; bytes[26] = 1; bytes[27] = 30;
         bytes[28..35].copy_from_slice(b"\x01vorbis");
         assert_eq!(audio_format(&bytes).unwrap().extension, "ogg");
         bytes[28..36].copy_from_slice(b"OpusHead");
         assert_eq!(audio_format(&bytes).unwrap().extension, "opus");
         let mut flac = vec![0; 42]; flac[..4].copy_from_slice(b"fLaC"); flac[7] = 34;
         assert_eq!(audio_format(&flac).unwrap().extension, "flac");
         let mut mp3 = vec![0; 417]; mp3[..4].copy_from_slice(&[0xff,0xfb,0x90,0x64]);
         assert_eq!(audio_format(&mp3).unwrap().extension, "mp3");
         assert_eq!(audio_format(&[0xff,0xf1,0x50,0x80,0,0xff,0xfc]).unwrap().extension, "aac");
         assert!(audio_format(b"ID3\x04\0\0\0\0\0\0#EXTM3U").is_none());
     }
 }
