use harbor_8spine_native_poc::{envelope, MAX_INPUT};
use serde_json::{json, Value};
use std::io::Write;
use std::process::{Command, Stdio};

fn search(fixture: &str) -> Value {
    json!({ "fixture": fixture, "operation": "search", "query": "test tone", "limit": 10 })
}

fn resolve(fixture: &str) -> Value {
    json!({ "fixture": fixture, "operation": "resolve", "trackId": 42, "quality": "LOSSLESS" })
}

fn run(input: Value) -> Value {
    envelope(input.to_string().as_bytes())
}

#[test]
fn documented_async_contract() {
    let result = run(search("catalog"));
    assert_eq!(result["ok"], true);
    assert_eq!(result["result"]["total"], 1);
    assert_eq!(result["result"]["tracks"][0]["id"], 42);
    let result = run(resolve("catalog"));
    assert_eq!(result["result"]["streamUrl"], "https://example.invalid/fixture.wav");
    assert_eq!(result["result"]["track"]["audioQuality"], "LOSSLESS");
}

#[test]
fn no_host_interfaces() {
    let result = run(search("capabilities"));
    assert_eq!(result["ok"], true);
    for name in ["process", "require", "fetch", "timers", "os", "std", "tauri", "window"] {
        assert_eq!(result["result"][name], "undefined", "{name}");
    }
}

#[test]
fn bounded_execution_and_error_redaction() {
    for (name, code) in [
        ("loop", "execution-timeout"),
        ("promise-loop", "execution-timeout"),
        ("pending", "unsettled-result"),
        ("oversized", "output-limit"),
        ("failure", "fixture-failed"),
    ] {
        assert_eq!(run(search(name)), json!({"ok": false, "error": code}), "{name}");
    }
}

#[test]
fn invalid_inputs_and_urls() {
    let mut input = search("catalog");
    input["query"] = json!("'); throw new Error('injection'); //");
    assert_eq!(run(input)["result"]["total"], 0);
    let mut extra = search("catalog");
    extra["source"] = json!("return {}");
    assert_eq!(run(extra)["error"], "invalid-request");
    assert_eq!(run(search("arbitrary code"))["error"], "invalid-request");
    assert_eq!(envelope(&vec![b'x'; MAX_INPUT + 1])["error"], "input-limit");
    assert_eq!(run(resolve("wrong-url"))["error"], "fixture-url-rejected");
}

#[test]
fn standalone_worker_json_stdio() {
    let mut cmd = Command::new(env!("CARGO_BIN_EXE_harbor-8spine-native-poc"));
    cmd.env_clear();
    #[cfg(windows)]
    if let Some(root) = std::env::var_os("SystemRoot") {
        cmd.env("SystemRoot", root);
    }
    let mut child = cmd.stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::piped())
        .spawn().expect("spawn fixture worker");
    child.stdin.take().unwrap().write_all(search("catalog").to_string().as_bytes()).unwrap();
    let output = child.wait_with_output().expect("read fixture worker");
    assert!(output.status.success());
    let value: Value = serde_json::from_slice(&output.stdout).unwrap();
    assert_eq!(value["result"]["tracks"][0]["id"], 42);
}
