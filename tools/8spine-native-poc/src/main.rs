#![cfg_attr(all(windows, feature = "windows-sandbox-fixture"), windows_subsystem = "windows")]

use harbor_8spine_native_poc::{envelope, MAX_INPUT};
use harbor_8spine_native_poc::adapter::{self, FixtureModule, HarborTrack, Quality};
use serde_json::{json, Value};
use std::io::{self, Read, Write};

fn main() {
    #[cfg(any(target_os = "linux", windows))]
    if std::env::args().nth(1).as_deref() == Some("--isolation-probe") {
        isolation_probe();
        return;
    }
    // Read at most the input limit plus one byte, then emit a single JSON message.
    let mut input = Vec::new();
    let reply = if io::stdin()
        .lock()
        .take((MAX_INPUT + 1) as u64)
        .read_to_end(&mut input)
        .is_ok()
    {
        if std::env::args().nth(1).as_deref() == Some("--harbor-adapter-fixture") {
            adapter_reply(&input)
        } else {
            envelope(&input)
        }
    } else {
        json!({ "ok": false, "error": "input-error" })
    };
    let _ = writeln!(io::stdout().lock(), "{reply}");
}

fn adapter_reply(input: &[u8]) -> Value {
    fn run(input: &[u8]) -> Result<Value, &'static str> {
        if input.len() > MAX_INPUT { return Err("input-limit"); }
        let req: Value = serde_json::from_slice(input).map_err(|_| "invalid-request")?;
        let object = req.as_object().ok_or("invalid-request")?;
        let module = match req["fixture"].as_str() {
            Some("catalog") => FixtureModule::Catalog,
            Some("broker") => FixtureModule::Broker,
            _ => return Err("invalid-request"),
        };
        match req["operation"].as_str() {
            Some("search") if object.len() == 4 => {
                let query = req["query"].as_str().ok_or("invalid-request")?;
                let limit = req["limit"].as_u64().filter(|n| (1..=50).contains(n)).ok_or("invalid-request")?;
                serde_json::to_value(adapter::search(module, query, limit as usize)?)
                    .map_err(|_| "serialization")
            }
            Some("resolve") if object.len() == 4 => {
                let track: HarborTrack = serde_json::from_value(req["track"].clone()).map_err(|_| "invalid-request")?;
                let quality = match req["quality"].as_str() {
                    Some("LOW") => Quality::Low,
                    Some("HIGH") => Quality::High,
                    Some("LOSSLESS") => Quality::Lossless,
                    _ => return Err("invalid-request"),
                };
                serde_json::to_value(adapter::resolve(module, &track, quality)?).map_err(|_| "serialization")
            }
            _ => Err("invalid-request"),
        }
    }
    match run(input) {
        Ok(result) => json!({"ok": true, "result": result}),
        Err(error) => json!({"ok": false, "error": error}),
    }
}

#[cfg(any(target_os = "linux", windows))]
fn isolation_probe() {
    use std::{net::{SocketAddr, TcpStream}, time::Duration};
    // Compiled-in diagnostic only: inspect access to a synthetic host sentinel
    // and a test-owned loopback listener. Never return bytes or connect elsewhere.
    let args: Vec<_> = std::env::args_os().collect();
    let result = (|| {
        if args.len() != 4 { return None; }
        let addr: SocketAddr = args[3].to_str()?.parse().ok()?;
        if !addr.ip().is_loopback() { return None; }
        let readable = std::fs::File::open(&args[2]).is_ok();
        let network = TcpStream::connect_timeout(&addr, Duration::from_millis(250)).is_ok();
        Some(json!({"hostFileReadable": readable, "hostNetworkReachable": network,
            "pathPresent": std::env::var_os("PATH").is_some()}))
    })();
    let reply = match result {
        Some(result) => json!({"ok": true, "result": result}),
        None => json!({"ok": false, "error": "invalid-request"}),
    };
    let _ = writeln!(io::stdout().lock(), "{reply}");
}
