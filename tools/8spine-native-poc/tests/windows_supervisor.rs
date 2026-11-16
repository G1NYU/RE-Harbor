#![cfg(windows)]

use harbor_8spine_native_poc::supervisor::WindowsFixtureSupervisor;
use serde_json::json;
use std::path::{Path, PathBuf};

#[tokio::test]
#[ignore = "requires the dedicated AppContainer harness and console-free fixture build"]
async fn windows_supervised_fixture() {
    let worker = Path::new(env!("CARGO_BIN_EXE_harbor-8spine-native-poc"));
    let launcher = PathBuf::from(std::env::var_os("HARBOR_8SPINE_TEST_LAUNCHER").expect("trusted CI launcher"));
    let supervisor = WindowsFixtureSupervisor::new(worker, &launcher).unwrap();
    let invalid = json!({"fixture":"catalog","operation":"search","query":"test tone","limit":10,"source":"return {}"});
    assert_eq!(supervisor.run_fixture(&invalid).await, Err("invalid-request"));
    let big = json!({"fixture":"catalog","operation":"search","query":"x".repeat(2000),"limit":10});
    assert_eq!(supervisor.run_fixture(&big).await, Err("input-limit"));
    assert!(WindowsFixtureSupervisor::new(worker, Path::new("relative.exe")).is_err());
    let search = json!({"fixture":"catalog","operation":"search","query":"test tone","limit":10});
    let result = supervisor.run_fixture(&search).await.unwrap();
    assert_eq!(result["ok"], true);
    assert_eq!(result["result"]["tracks"][0]["id"], 42);
    let resolve = json!({"fixture":"catalog","operation":"resolve","trackId":42,"quality":"HIGH"});
    let resolved = supervisor.run_fixture(&resolve).await.unwrap();
    assert_eq!(resolved["ok"], true);
    assert_eq!(resolved["result"]["streamUrl"], "https://example.invalid/fixture.wav");
    let runaway = json!({"fixture":"loop","operation":"search","query":"test","limit":1});
    let failed = supervisor.run_fixture(&runaway).await.unwrap();
    assert_eq!(failed["ok"], false);
    assert_eq!(failed["error"], "execution-timeout");
    assert_eq!(supervisor.run_fixture(&search).await.unwrap()["ok"], true);

    let (mut manager, key, package, permit) = imported::approved();
    let result = supervisor.run_approved_fixture(&manager, &permit, &package, &imported::search()).await.unwrap();
    imported::check_search(&result);
    let result = supervisor.run_approved_fixture(&manager, &permit, &package, &imported::resolve()).await.unwrap();
    imported::check_resolve(&result);
    assert_eq!(supervisor.run_fixture(&imported::raw_request()).await, Err("fixture-consent-required"));
    manager.disable(&key).unwrap();
    assert_eq!(supervisor.run_approved_fixture(&manager, &permit, &package, &imported::search()).await, Err("revoked"));
    host_broker_checks(&supervisor).await;
}

#[path = "support_imported/mod.rs"]
mod imported;

async fn host_broker_checks(supervisor: &WindowsFixtureSupervisor) {
    use harbor_8spine_native_poc::{host_bridge::SOURCE, module_manager::{ModuleManager, parse_catalog}};
    let repo = "https://8spine-modules.pages.dev/index.json";
    let raw = br#"{"category:modules":[{"id":"bridge-fixture","name":"Bridge fixture","version":"1","type":"MODULE","download":"fixture.js"}]}"#;
    let entry = parse_catalog(repo, raw).unwrap().remove(0);
    let mut manager = ModuleManager::default();
    manager.stage(&entry, SOURCE.as_bytes()).unwrap();
    let sha = manager.get(&entry.key).unwrap().fingerprint().to_owned();
    manager.approve(&entry.key, &sha, &["api.example.com"]).unwrap();
    let permit = manager.permit(&entry.key, SOURCE.as_bytes()).unwrap();
    let denied = supervisor.run_host_broker_fixture(&manager, &permit, SOURCE.as_bytes()).await.unwrap();
    assert_eq!(denied, json!({"ok":false,"error":"fixture-failed"}));
    manager.disable(&entry.key).unwrap();
    assert_eq!(supervisor.run_host_broker_fixture(&manager, &permit, SOURCE.as_bytes()).await, Err("revoked"));
    let bypass = json!({"fixture":"host-broker","operation":"search","query":"catalog","limit":1});
    assert_eq!(supervisor.run_fixture(&bypass).await, Err("fixture-consent-required"));
    manager.approve(&entry.key, &sha, &["8spine-modules.pages.dev"]).unwrap();
    let permit = manager.permit(&entry.key, SOURCE.as_bytes()).unwrap();
    let live = supervisor.run_host_broker_fixture(&manager, &permit, SOURCE.as_bytes()).await.unwrap();
    assert_eq!(live["ok"], true);
    assert!(live["result"]["categories"].as_u64().unwrap() > 0);
}
