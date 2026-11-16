//! Linux and Windows fixture IPC. Child has no sockets; host owns all network access.
//! Fixed compiled-in source and endpoint, no general module loader.
use crate::module_manager::{ModuleManager, ModulePermit, network_broker::ModuleNetworkBroker};
use serde_json::{json, Value};
use std::{io::{self, Read, Write}, time::Duration};
use tokio::{io::{AsyncReadExt, AsyncWriteExt}, process::Command};

pub const SOURCE: &str = r#"return {
    async searchTracks() {
        const response = await fetch("https://8spine-modules.pages.dev/index.json");
        if (!response.ok) throw new Error("http-status");
        const catalog = await response.json();
        const music = await fetch("https://8spine-modules.pages.dev/__harbor_synthetic_music_fixture");
        if (!music.ok) throw new Error("music-status");
        const data = await music.json();
        return { categories: Object.keys(catalog).filter(key => key.startsWith("category:")).length, tracks: data.tracks };
    }
};"#;

// JSON escaping can expand a 32 KiB text body by up to six times.
const MAX_FRAME: usize = 256 * 1024 + 1024;
const MAX_CALLS: usize = 8;
const MAX_SOURCE: usize = 128 * 1024;

pub fn approved_search_worker() -> io::Result<()> {
    let input: Value = serde_json::from_slice(&read_frame(io::stdin().lock())?)
        .map_err(io::Error::other)?;
    let reply = match crate::evaluate_approved_search(&input, request) {
        Ok(result) => json!({"ok":true,"result":result}),
        Err(error) => json!({"ok":false,"error":error}),
    };
    write_frame(io::stdout().lock(), &json!({"reply":reply}))
}

pub(crate) fn approved_search_input(manager: &ModuleManager, permit: &ModulePermit,
    bytes: &[u8], query: &str, limit: usize) -> Result<Value, &'static str> {
    let source = manager.approved_source_body(permit, bytes)?;
    if source.len() > MAX_SOURCE || query.trim().is_empty() || query.len() > 512 || !(1..=50).contains(&limit) {
        return Err("invalid-request");
    }
    let request = json!({"source":source,"query":query,"limit":limit});
    if serde_json::to_vec(&request).map_err(|_| "invalid-request")?.len() > MAX_FRAME {
        return Err("input-limit");
    }
    Ok(request)
}

pub(crate) fn approved_resolve_input(manager: &ModuleManager, permit: &ModulePermit,
    bytes: &[u8], track_id: &Value, quality: &str) -> Result<Value, &'static str> {
    if !matches!(quality, "LOW" | "HIGH" | "LOSSLESS") { return Err("invalid-request"); }
    let source = manager.approved_source_body(permit, bytes)?;
    if source.len() > MAX_SOURCE { return Err("input-limit"); }
    if !(track_id.as_str().is_some_and(|s| !s.trim().is_empty() && s.len() <= 512 && !s.chars().any(char::is_control))
        || track_id.as_i64().is_some_and(|n| (-9007199254740991..=9007199254740991).contains(&n))) {
        return Err("invalid-request");
    }
    let request = json!({"source":source,"trackId":track_id,"quality":quality});
    if serde_json::to_vec(&request).map_err(|_| "invalid-request")?.len() > MAX_FRAME { return Err("input-limit"); }
    Ok(request)
}

// Only an approved HTTPS destination is returned; no module-controlled headers,
// manifests or local paths. Harbor downloads bytes using its own network grant.
fn sanitized_resolve(raw: &Value, manager: &ModuleManager, permit: &ModulePermit) -> Result<Value, &'static str> {
    let url = raw["streamUrl"].as_str().ok_or("invalid-stream")?;
    let grant = manager.network_grant(permit)?;
    // Use the permit-owned grant directly rather than a caller-supplied host.
    manager.authorize_media_url(permit, &grant, url)?;
    Ok(json!({"streamUrl":url}))
}

// Return only bounded music metadata. Never forward arbitrary module artwork,
// playback URLs, headers or unknown fields to the application.
fn sanitized_search(raw: &Value, limit: usize) -> Result<Value, &'static str> {
    let tracks = raw["tracks"].as_array().ok_or("invalid-search-result")?;
    let total = raw["total"].as_u64().ok_or("invalid-search-result")?;
    if tracks.len() > limit || total < tracks.len() as u64 { return Err("invalid-search-result"); }
    let mut ids = std::collections::BTreeSet::new();
    let mut safe = Vec::new();
    for track in tracks {
        let id = &track["id"];
        if !(id.as_str().is_some_and(|s| !s.trim().is_empty() && s.len() <= 512 && !s.chars().any(char::is_control))
            || id.as_i64().is_some_and(|n| (-9007199254740991..=9007199254740991).contains(&n))) {
            return Err("invalid-track-id");
        }
        if !ids.insert(id.to_string()) { return Err("duplicate-track-id"); }
        let title = track["title"].as_str().filter(|s| !s.trim().is_empty() && s.len() <= 512 && !s.chars().any(char::is_control))
            .ok_or("invalid-metadata")?;
        let artist = track["artist"].as_str().filter(|s| !s.trim().is_empty() && s.len() <= 512 && !s.chars().any(char::is_control))
            .ok_or("invalid-metadata")?;
        let duration = track["duration"].as_f64().filter(|d| d.is_finite() && *d > 0.0 && *d <= 86400.0)
            .ok_or("invalid-duration")?;
        safe.push(json!({"id":id,"title":title,"artist":artist,"duration":duration}));
    }
    Ok(json!({"tracks":safe,"total":total}))
}


fn read_frame(mut reader: impl Read) -> io::Result<Vec<u8>> {
    let mut size = [0; 4];
    reader.read_exact(&mut size)?;
    let size = u32::from_be_bytes(size) as usize;
    if size == 0 || size > MAX_FRAME { return Err(io::ErrorKind::InvalidData.into()); }
    let mut bytes = vec![0; size];
    reader.read_exact(&mut bytes)?;
    Ok(bytes)
}

fn write_frame(mut writer: impl Write, value: &Value) -> io::Result<()> {
    let bytes = serde_json::to_vec(value).map_err(io::Error::other)?;
    if bytes.len() > MAX_FRAME { return Err(io::ErrorKind::InvalidData.into()); }
    writer.write_all(&(bytes.len() as u32).to_be_bytes())?;
    writer.write_all(&bytes)?;
    writer.flush()
}

fn request(payload: String) -> String {
    let result = (|| {
        write_frame(io::stdout().lock(), &json!({"request": payload}))?;
        let data = read_frame(io::stdin().lock())?;
        String::from_utf8(data).map_err(io::Error::other)
    })();
    result.unwrap_or_else(|_| json!({"ok":false,"error":"broker-io"}).to_string())
}

pub fn worker_main() -> io::Result<()> {
    let input = br#"{"fixture":"host-broker","operation":"search","query":"catalog","limit":1}"#;
    let reply = match crate::evaluate(input, Some(request)) {
        Ok(result) => json!({"ok":true,"result":result}),
        Err(error) => json!({"ok":false,"error":error}),
    };
    write_frame(io::stdout().lock(), &json!({"reply": reply}))
}

async fn read_async(reader: &mut (impl tokio::io::AsyncRead + Unpin)) -> Result<Value, &'static str> {
    let size = reader.read_u32().await.map_err(|_| "worker-protocol")? as usize;
    if size == 0 || size > MAX_FRAME { return Err("worker-output-limit"); }
    let mut bytes = vec![0; size];
    reader.read_exact(&mut bytes).await.map_err(|_| "worker-protocol")?;
    serde_json::from_slice(&bytes).map_err(|_| "worker-protocol")
}

async fn write_async(writer: &mut (impl tokio::io::AsyncWrite + Unpin), value: &Value) -> Result<(), &'static str> {
    let bytes = serde_json::to_vec(value).map_err(|_| "worker-protocol")?;
    if bytes.len() > MAX_FRAME { return Err("worker-output-limit"); }
    writer.write_u32(bytes.len() as u32).await.map_err(|_| "worker-input")?;
    writer.write_all(&bytes).await.map_err(|_| "worker-input")?;
    writer.flush().await.map_err(|_| "worker-input")
}

pub(crate) async fn exchange(mut cmd: Command, manager: &ModuleManager, permit: &ModulePermit) -> Result<Value, &'static str> {
    let mut broker = ModuleNetworkBroker::new(manager, permit)?;
    let mut child = cmd.spawn().map_err(|_| "worker-spawn")?;
    let mut stdin = child.stdin.take().ok_or("worker-stdin")?;
    let mut stdout = child.stdout.take().ok_or("worker-stdout")?;
    let wall = if cfg!(windows) { 22 } else { 15 };
    let result = tokio::time::timeout(Duration::from_secs(wall), async {
        let mut calls = 0;
        loop {
            let frame = read_async(&mut stdout).await?;
            let obj = frame.as_object().ok_or("worker-protocol")?;
            if obj.len() != 1 { return Err("worker-protocol"); }
            if let Some(payload) = obj.get("request").and_then(Value::as_str) {
                if calls >= MAX_CALLS { return Err("request-limit"); }
                calls += 1;
                // Fixed fixture endpoint only; a compromised child cannot use
                // this experiment as a general network proxy.
                let expected = json!({"url":"https://8spine-modules.pages.dev/index.json","method":"GET"});
                let parsed: Value = serde_json::from_str(payload).map_err(|_| "worker-protocol")?;
                let synthetic = json!({"url":"https://8spine-modules.pages.dev/__harbor_synthetic_music_fixture","method":"GET"});
                let response = if calls == 1 && parsed == expected {
                    broker.request(manager, payload.as_bytes()).await
                } else if calls == 2 && parsed == synthetic {
                    broker.synthetic_music_fixture(manager, payload.as_bytes())
                } else { return Err("worker-protocol"); };
                let reply = match response {
                    Ok(reply) => json!({"ok":true,"response":{"status":reply.status,"body":reply.body}}),
                    Err(code) => json!({"ok":false,"error":code}),
                };
                write_async(&mut stdin, &reply).await?;
            } else if let Some(reply) = obj.get("reply") {
                let ok = reply["ok"].as_bool().ok_or("worker-protocol")?;
                if (ok && calls != 2) || (!ok && !(1..=2).contains(&calls)) { return Err("worker-protocol"); }
                if reply.as_object().map(|o| o.len()) != Some(2) ||
                    (ok && (!reply["result"]["categories"].is_u64() || reply["result"]["tracks"] != json!([{"id":42,"title":"Synthetic test tone"}]))) ||
                    (!ok && reply["error"] != "fixture-failed") {
                    return Err("worker-protocol");
                }
                drop(stdin);
                let mut extra = [0; 1];
                if stdout.read(&mut extra).await.map_err(|_| "worker-output")? != 0 {
                    return Err("worker-protocol");
                }
                if !child.wait().await.map_err(|_| "worker-wait")?.success() {
                    return Err("worker-exit");
                }
                return Ok(reply.clone());
            } else { return Err("worker-protocol"); }
        }
    }).await;
    match result {
        Ok(Ok(reply)) => Ok(reply),
        other => {
            let _ = child.start_kill();
            let _ = tokio::time::timeout(Duration::from_secs(1), child.wait()).await;
            match other {
                Ok(Err(code)) => Err(code),
                Err(_) => Err("worker-timeout"),
                _ => unreachable!(),
            }
        }
    }
}

// Generic, experimental search only. The host owns the permit throughout the
// invocation. No direct sockets and no media URL resolution in this protocol.
pub(crate) async fn exchange_approved_search(mut cmd: Command, manager: &ModuleManager,
    permit: &ModulePermit, input: Value) -> Result<Value, &'static str> {
    let limit = input["limit"].as_u64().map(|n| n as usize);
    if limit.is_none() && input.get("trackId").is_none() { return Err("invalid-request"); }
    let mut broker = ModuleNetworkBroker::new(manager, permit)?;
    let mut child = cmd.spawn().map_err(|_| "worker-spawn")?;
    let mut stdin = child.stdin.take().ok_or("worker-stdin")?;
    let mut stdout = child.stdout.take().ok_or("worker-stdout")?;
    let wall = if cfg!(windows) { 22 } else { 15 };
    let result = tokio::time::timeout(Duration::from_secs(wall), async {
        write_async(&mut stdin, &input).await?;
        let mut calls = 0;
        loop {
            let frame = read_async(&mut stdout).await?;
            let obj = frame.as_object().ok_or("worker-protocol")?;
            if obj.len() != 1 { return Err("worker-protocol"); }
            if let Some(payload) = obj.get("request").and_then(Value::as_str) {
                if calls >= MAX_CALLS { return Err("request-limit"); }
                calls += 1;
                let reply = match broker.request(manager, payload.as_bytes()).await {
                    Ok(reply) => json!({"ok":true,"response":{"status":reply.status,"body":reply.body}}),
                    Err(error) => json!({"ok":false,"error":error}),
                };
                write_async(&mut stdin, &reply).await?;
            } else if let Some(reply) = obj.get("reply") {
                if reply.as_object().map(|o| o.len()) != Some(2) { return Err("worker-protocol"); }
                let output = match reply["ok"].as_bool() {
                    Some(true) => match limit {
                        Some(limit) => sanitized_search(&reply["result"], limit)?,
                        None => sanitized_resolve(&reply["result"], manager, permit)?,
                    },
                    Some(false) => return Err("module-search-failed"),
                    None => return Err("worker-protocol"),
                };
                drop(stdin);
                let mut extra = [0; 1];
                if stdout.read(&mut extra).await.map_err(|_| "worker-output")? != 0 {
                    return Err("worker-protocol");
                }
                if !child.wait().await.map_err(|_| "worker-wait")?.success() { return Err("worker-exit"); }
                manager.network_grant(permit)?;
                return Ok(output);
            } else { return Err("worker-protocol"); }
        }
    }).await;
    match result {
        Ok(Ok(output)) => Ok(output),
        other => {
            let _ = child.start_kill();
            let _ = tokio::time::timeout(Duration::from_secs(1), child.wait()).await;
            match other {
                Ok(Err(code)) => Err(code),
                Err(_) => Err("worker-timeout"),
                _ => unreachable!(),
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn sync_frames_reject_truncated_and_oversized_lengths() {
        assert!(read_frame(&[0,0,0,0][..]).is_err());
        assert!(read_frame(&[255,255,255,255][..]).is_err());
        assert!(read_frame(&[0,0,0,3,1][..]).is_err());
        let mut bytes = Vec::new();
        write_frame(&mut bytes, &json!({"reply":true})).unwrap();
        assert_eq!(serde_json::from_slice::<Value>(&read_frame(&bytes[..]).unwrap()).unwrap(), json!({"reply":true}));
    }
}
