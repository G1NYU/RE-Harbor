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

#[test]
fn fixture_fetch_success_and_resolution() {
    let got = run(search("broker"));
    assert_eq!(got["ok"], true, "{got}");
    assert_eq!(got["result"]["tracks"][0]["id"], 42);
    assert_eq!(got["result"]["rawBridge"], "undefined");
    let got = run(resolve("broker"));
    assert_eq!(got["result"]["streamUrl"], "https://example.invalid/fixture.wav");
    assert_eq!(got["result"]["track"]["audioQuality"], "LOSSLESS");
}

#[test]
fn broker_rejects_unapproved_requests_and_caps_usage() {
    for (case, code) in [
        ("http", "destination-denied"),
        ("private", "destination-denied"),
        ("ipv6", "destination-denied"),
        ("metadata", "destination-denied"),
        ("alias", "destination-denied"),
        ("credentials", "destination-denied"),
        ("port", "destination-denied"),
        ("fragment", "destination-denied"),
        ("post", "method-denied"),
        ("headers", "invalid-request"),
        ("redirect", "redirect-denied"),
        ("oversized", "response-size"),
        ("route", "route-denied"),
        ("budget", "request-limit"),
        ("size", "request-size"),
    ] {
        let mut input = search("broker");
        input["query"] = json!(format!("policy:{case}"));
        assert_eq!(
            run(input),
            json!({"ok": true, "result": {"denied": true, "code": code}}),
            "{case}",
        );
    }
    let mut input = search("broker");
    input["query"] = json!("policy:missing");
    assert_eq!(run(input)["result"], json!({"status": 404, "ok": false}));
}

#[test]
fn adapter_worker_json_stdio() {
    fn request(input: Value) -> Value {
        let mut command = Command::new(env!("CARGO_BIN_EXE_harbor-8spine-native-poc"));
        command.arg("--harbor-adapter-fixture").env_clear();
        #[cfg(windows)]
        if let Some(root) = std::env::var_os("SystemRoot") {
            command.env("SystemRoot", root);
        }
        let mut child = command.stdin(Stdio::piped()).stdout(Stdio::piped())
            .stderr(Stdio::null()).spawn().unwrap();
        child.stdin.take().unwrap().write_all(input.to_string().as_bytes()).unwrap();
        let reply = child.wait_with_output().unwrap();
        assert!(reply.status.success());
        serde_json::from_slice(&reply.stdout).unwrap()
    }
    let tracks = request(search("catalog"));
    assert_eq!(tracks["ok"], true);
    assert_eq!(tracks["result"][0]["connectorId"], "8spine-fixture-catalog");
    let result = request(json!({"fixture":"catalog","operation":"resolve",
        "track": tracks["result"][0], "quality":"HIGH"}));
    assert_eq!(result["result"]["url"], "https://example.invalid/fixture.wav");
    assert_eq!(request(json!({"fixture":"arbitrary","operation":"search","query":"test","limit":1}))["error"], "invalid-request");
}
