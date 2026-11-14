use harbor_8spine_native_poc::{envelope, MAX_INPUT};
use harbor_8spine_native_poc::adapter::{self, FixtureModule, HarborTrack, Quality};
use serde_json::{json, Value};
use std::io::{self, Read, Write};

fn main() {
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
