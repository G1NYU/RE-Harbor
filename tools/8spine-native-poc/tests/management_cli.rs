use serde_json::Value;
use std::{path::Path, process::Command};

fn invoke(root: &Path, args: &[&str]) -> (bool, Value) {
    let output = Command::new(env!("CARGO_BIN_EXE_8spine-manager"))
        .arg(root).args(args).output().expect("manager CLI");
    let reply = serde_json::from_slice(&output.stdout).expect("JSON envelope");
    (output.status.success(), reply)
}

#[test]
fn metadata_cli_persists_repository_and_never_enables_execution() {
    let root = tempfile::tempdir().unwrap();
    let root = root.path();
    let (success, empty) = invoke(root, &["list"]);
    assert!(success);
    assert_eq!(empty["result"]["executionAvailable"], false);
    assert_eq!(empty["result"]["repositories"].as_array().unwrap().len(), 0);
    let (success, added) = invoke(root, &["add", "https://modules.example.com/"]);
    assert!(success);
    assert_eq!(added["result"]["repositories"][0], "https://modules.example.com/index.json");
    assert_eq!(invoke(root, &["list"]).1, added);
    assert_eq!(invoke(root, &["enable", "fixture"]).1["error"], "invalid-command");
    assert_eq!(invoke(root, &["add", "https://127.0.0.1/"]).1["error"], "invalid-url");
    assert_eq!(invoke(root, &["browse", "https://unregistered.example.com/"]).1["error"], "repository-not-registered");
    assert_eq!(invoke(root, &["list"]).1, added);
    let (success, removed) = invoke(root, &["remove-repository", "https://modules.example.com/"]);
    assert!(success);
    assert_eq!(removed, empty);
}

#[test]
fn metadata_cli_refuses_concurrent_writer_and_corrupt_state() {
    let root = tempfile::tempdir().unwrap();
    let root = root.path();
    let lock = root.join("8spine-manager.lock");
    std::fs::write(&lock, "other writer").unwrap();
    let (success, reply) = invoke(root, &["list"]);
    assert!(!success);
    assert_eq!(reply["error"], "state-lock");
    assert_eq!(std::fs::read_to_string(&lock).unwrap(), "other writer");
    std::fs::remove_file(lock).unwrap();
    let state = root.join("8spine-state.json");
    std::fs::write(&state, "{").unwrap();
    let (success, reply) = invoke(root, &["add", "https://modules.example.com/"]);
    assert!(!success);
    assert_eq!(reply["error"], "invalid-state");
    assert_eq!(std::fs::read_to_string(state).unwrap(), "{");
}
