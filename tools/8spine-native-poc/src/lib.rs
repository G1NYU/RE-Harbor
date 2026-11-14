//! Development fixture only. No downloaded JavaScript, networking, or host APIs.
use rquickjs::{Context, Promise, Runtime};
use serde_json::{json, Value};
use std::time::{Duration, Instant};

pub const MAX_INPUT: usize = 8 * 1024;
const MAX_OUTPUT: usize = 256 * 1024;
const MEMORY: usize = 16 * 1024 * 1024;
const STACK: usize = 256 * 1024;

fn fixture(name: &str) -> Option<&'static str> {
    Some(match name {
        "catalog" => include_str!("../fixtures/catalog.js"),
        "capabilities" => r#"return { searchTracks() { return {
            process: typeof process, require: typeof require, fetch: typeof fetch,
            timers: typeof setTimeout, os: typeof os, std: typeof std,
            tauri: typeof __TAURI__, window: typeof window
        }; } };"#,
        "loop" => "return { searchTracks() { while (true) {} } };",
        "pending" => "return { searchTracks() { return new Promise(() => {}); } };",
        "promise-loop" => "return { async searchTracks() { while (true) await Promise.resolve(); } };",
        "oversized" => "return { searchTracks() { return 'x'.repeat(300000); } };",
        "failure" => "return { searchTracks() { throw new Error('private fixture detail'); } };",
        "wrong-url" => r#"return { getTrackStreamUrl() { return {
            streamUrl: "https://other.invalid/fixture.wav", track: { id: 42, audioQuality: "HIGH" }
        }; } };"#,
        _ => return None,
    })
}

// A bounded JSON protocol avoids passing host handles or interpolating user code.
fn validated_request(input: &[u8]) -> Result<(Value, &'static str), &'static str> {
    if input.len() > MAX_INPUT {
        return Err("input-limit");
    }
    let req: Value = serde_json::from_slice(input).map_err(|_| "invalid-request")?;
    let object = req.as_object().ok_or("invalid-request")?;
    if object.keys().any(|k| {
        !matches!(k.as_str(), "fixture" | "operation" | "query" | "limit" | "trackId" | "quality")
    }) {
        return Err("invalid-request");
    }
    let source = fixture(req["fixture"].as_str().ok_or("invalid-request")?)
        .ok_or("invalid-request")?;
    match req["operation"].as_str() {
        Some("search") => {
            let query = req["query"].as_str().ok_or("invalid-request")?;
            let limit = req["limit"].as_u64().ok_or("invalid-request")?;
            if query.trim().is_empty() || query.len() > 512 || !(1..=50).contains(&limit) {
                return Err("invalid-request");
            }
        }
        Some("resolve") => {
            let id = &req["trackId"];
            let valid_id = id.as_str().is_some_and(|s| !s.is_empty() && s.len() <= 512)
                || id.as_i64().is_some_and(|i| (-9007199254740991..=9007199254740991).contains(&i));
            if !valid_id || !matches!(req["quality"].as_str(), Some("HIGH" | "LOW" | "LOSSLESS")) {
                return Err("invalid-request");
            }
        }
        _ => return Err("invalid-request"),
    }
    Ok((req, source))
}

pub fn handle(input: &[u8]) -> Result<Value, &'static str> {
    let (request, source) = validated_request(input)?;
    let runtime = Runtime::new().map_err(|_| "runtime-init")?;
    runtime.set_memory_limit(MEMORY);
    runtime.set_max_stack_size(STACK);
    let deadline = Instant::now() + Duration::from_millis(350);
    runtime.set_interrupt_handler(Some(Box::new(move || Instant::now() >= deadline)));
    let context = Context::full(&runtime).map_err(|_| "runtime-init")?;
    // No module loader, native callbacks, fetch, filesystem, environment or shell.
    let data = serde_json::to_string(&request.to_string()).map_err(|_| "invalid-request")?;
    let script = format!(
        r#"(async () => {{
            "use strict";
            const input = JSON.parse({data});
            const moduleInstance = (function () {{ {source} }})();
            const result = input.operation === "search"
                ? await moduleInstance.searchTracks(input.query, input.limit)
                : await moduleInstance.getTrackStreamUrl(input.trackId, input.quality);
            return JSON.stringify(result);
        }})()"#
    );
    let result = context.with(|ctx| {
        let promise: Promise = ctx.eval(script)?;
        promise.finish::<String>()
    });
    let raw = match result {
        Ok(raw) => raw,
        Err(_) if Instant::now() >= deadline => return Err("execution-timeout"),
        Err(rquickjs::Error::WouldBlock) => return Err("unsettled-result"),
        Err(_) => return Err("fixture-failed"),
    };
    if raw.len() > MAX_OUTPUT {
        return Err("output-limit");
    }
    let value: Value = serde_json::from_str(&raw).map_err(|_| "invalid-output")?;
    if request["operation"] == "resolve"
        && value["streamUrl"] != "https://example.invalid/fixture.wav"
    {
        return Err("fixture-url-rejected");
    }
    Ok(value)
}

pub fn envelope(input: &[u8]) -> Value {
    match handle(input) {
        Ok(result) => json!({ "ok": true, "result": result }),
        Err(error) => json!({ "ok": false, "error": error }),
    }
}
