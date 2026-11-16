use std::{io::Write, process::{Command, Stdio}};
use serde_json::{json,Value};
use sha2::{Sha256,Digest};

#[test]
#[ignore = "requires Linux namespace isolation and explicit external iTunes metadata lookup"]
#[cfg(target_os = "linux")]
fn live_search_runner() {
    let package = include_str!("../examples/itunes-metadata.js");
    let input = json!({
        "entry":{"key":{"id":"harbor-itunes-metadata","repository":"https://modules.example.com/index.json"},
        "name":"iTunes (metadata only)","version":"1.0.0","download":"https://modules.example.com/itunes-metadata.js","author":"Harbor development example"},
        "fingerprint":format!("{:x}", Sha256::digest(package.as_bytes())),
        "hosts":["itunes.apple.com"],"package":package,"query":"Jack Johnson Banana Pancakes","limit":3
    });
    let mut child = Command::new(env!("CARGO_BIN_EXE_8spine-search"))
        .stdin(Stdio::piped()).stdout(Stdio::piped()).spawn().unwrap();
    child.stdin.take().unwrap().write_all(input.to_string().as_bytes()).unwrap();
    let out = child.wait_with_output().unwrap();
    assert!(out.status.success());
    let response: Value = serde_json::from_slice(&out.stdout).unwrap();
    assert_eq!(response["ok"],true, "real metadata search: {response}");
    let tracks = response["result"]["tracks"].as_array().unwrap();
    assert!(!tracks.is_empty());
    assert!(tracks.iter().any(|t| t["title"].as_str().unwrap_or("").to_lowercase().contains("banana pancakes")));
    assert!(tracks.iter().all(|t| t.get("streamUrl").is_none() && t.get("artwork").is_none()));
    println!("Returned {} real song metadata result(s) through the search runner",tracks.len());
}
