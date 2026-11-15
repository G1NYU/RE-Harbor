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
}

#[path = "support_imported/mod.rs"]
mod imported;
