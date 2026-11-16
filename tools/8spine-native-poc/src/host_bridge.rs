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
