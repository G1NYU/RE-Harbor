//! Development fixture only. No downloaded JavaScript or real network access.
mod broker;
mod catalog;
#[cfg(any(target_os = "linux", windows))]
pub mod host_bridge;
// Host-only development API; never exposed to the JavaScript runtime.
pub mod http_transport;
// Harbor-shaped fixture adapter, not registered with the application yet.
pub mod adapter;
// Host-owned metadata and consent model; no package execution.
pub mod module_manager;
// Fixture-only host process supervision and optional Linux namespace isolation.
pub mod supervisor;
use rquickjs::{Context, Function, Promise, Runtime};
use std::cell::Cell;
use std::rc::Rc;
use serde_json::{json, Value};
use std::time::{Duration, Instant};

pub const MAX_INPUT: usize = 8 * 1024;
const MAX_OUTPUT: usize = 256 * 1024;
const MEMORY: usize = 16 * 1024 * 1024;
const STACK: usize = 256 * 1024;
// Exact, locally authored source. This is not an allowlist of third-party code.
const IMPORTED_FIXTURE: &str = include_str!("../fixtures/imported.js");

fn fixture(name: &str) -> Option<&'static str> {
    Some(match name {
        "catalog" => include_str!("../fixtures/catalog.js"),
        "broker" => include_str!("../fixtures/broker.js"),
        #[cfg(any(target_os = "linux", windows))]
        "host-broker" => host_bridge::SOURCE,
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
fn validated_request(input: &[u8]) -> Result<(Value, String), &'static str> {
    if input.len() > MAX_INPUT {
        return Err("input-limit");
    }
    let req: Value = serde_json::from_slice(input).map_err(|_| "invalid-request")?;
    let object = req.as_object().ok_or("invalid-request")?;
    if object.keys().any(|k| {
        !matches!(k.as_str(), "fixture" | "operation" | "query" | "limit" | "trackId" | "quality" | "source")
    }) {
        return Err("invalid-request");
    }
    let name = req["fixture"].as_str().ok_or("invalid-request")?;
    let source = if name == "imported-fixture" {
        // A caller cannot authorize arbitrary JavaScript by supplying a hash.
        // The child verifies the actual transmitted source against its own
        // trusted built-in copy before constructing any engine context.
        let source = req["source"].as_str().ok_or("invalid-request")?;
        if source != IMPORTED_FIXTURE { return Err("invalid-request"); }
        source.to_owned()
    } else {
        if object.contains_key("source") { return Err("invalid-request"); }
        fixture(name).ok_or("invalid-request")?.to_owned()
    };
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
    evaluate(input, None)
}

fn evaluate(input: &[u8], bridge: Option<fn(String) -> String>) -> Result<Value, &'static str> {
    let (request, source) = validated_request(input)?;
    if (request["fixture"] == "host-broker") != bridge.is_some() {
        return Err("invalid-request");
    }
    let value = evaluate_body(&request, &source, bridge)?;
    if request["operation"] == "resolve"
        && value["streamUrl"] != "https://example.invalid/fixture.wav"
    {
        return Err("fixture-url-rejected");
    }
    Ok(value)
}

// Experimental plain-source search worker only. Host permission and OS
// isolation must be established before invoking this private worker entry.
#[cfg(any(target_os = "linux", windows))]
fn evaluate_approved_search(input: &Value, bridge: fn(String) -> String) -> Result<Value, &'static str> {
    let object = input.as_object().ok_or("invalid-request")?;
    if object.len() != 3 { return Err("invalid-request"); }
    let source = input["source"].as_str().filter(|s| !s.is_empty() && s.len() <= 128 * 1024)
        .ok_or("input-limit")?;
    let request = if object.contains_key("trackId") {
        let id = &input["trackId"];
        if !(id.as_str().is_some_and(|s| !s.trim().is_empty() && s.len() <= 512 && !s.chars().any(char::is_control))
            || id.as_i64().is_some_and(|n| (-9007199254740991..=9007199254740991).contains(&n))) {
            return Err("invalid-request");
        }
        if input["quality"] != "HIGH" { return Err("invalid-request"); }
        json!({"operation":"resolve","trackId":id,"quality":"HIGH"})
    } else {
        let query = input["query"].as_str().filter(|q| !q.trim().is_empty() && q.len() <= 512)
            .ok_or("invalid-request")?;
        let limit = input["limit"].as_u64().filter(|n| (1..=50).contains(n))
            .ok_or("invalid-request")?;
        json!({"operation":"search","query":query,"limit":limit})
    };
    evaluate_body(&request, source, Some(bridge))
}

fn evaluate_body(request: &Value, source: &str, bridge: Option<fn(String) -> String>) -> Result<Value, &'static str> {
    let runtime = Runtime::new().map_err(|_| "runtime-init")?;
    runtime.set_memory_limit(MEMORY);
    runtime.set_max_stack_size(STACK);
    let deadline = Instant::now() + if bridge.is_some() { Duration::from_secs(12) } else { Duration::from_millis(350) };
    runtime.set_interrupt_handler(Some(Box::new(move || Instant::now() >= deadline)));
    let context = Context::full(&runtime).map_err(|_| "runtime-init")?;
    // Only the compiled-in broker fixture receives the simulated fetch capability.
    // No real HTTP transport, filesystem, environment, shell or module loader.
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
        if request["fixture"] == "broker" {
            let broker = Rc::new(broker::Broker::new(deadline));
            let calls = Rc::new(Cell::new(0usize));
            let function = Function::new(ctx.clone(), move |payload: String| {
                broker.request(&calls, &payload)
            })?;
            ctx.globals().set("__fixtureBroker", function)?;
            ctx.eval::<(), _>(include_str!("../fixtures/fetch-shim.js"))?;
        } else if let Some(bridge) = bridge {
            let function = Function::new(ctx.clone(), bridge)?;
            ctx.globals().set("__fixtureBroker", function)?;
            ctx.eval::<(), _>(include_str!("../fixtures/fetch-shim.js"))?;
        }
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
    serde_json::from_str(&raw).map_err(|_| "invalid-output")
}

pub fn envelope(input: &[u8]) -> Value {
    match handle(input) {
        Ok(result) => json!({ "ok": true, "result": result }),
        Err(error) => json!({ "ok": false, "error": error }),
    }
}
