use harbor_8spine_native_poc::supervisor::{Isolation, Supervisor};
use serde_json::{json, Value};
use std::{path::Path, time::Duration};

fn binary() -> &'static Path {
    Path::new(env!("CARGO_BIN_EXE_harbor-8spine-native-poc"))
}

fn search(fixture: &str) -> Value {
    json!({"fixture":fixture,"operation":"search","query":"test tone","limit":10})
}

#[tokio::test]
async fn supervised_fixture_and_unknown_source() {
    let worker = Supervisor::new(binary(), Duration::from_secs(5), Isolation::TrustedFixture).unwrap();
    let result = worker.run_fixture(&search("catalog")).await.unwrap();
    assert_eq!(result["ok"], true);
    assert_eq!(result["result"]["tracks"][0]["id"], 42);
    assert_eq!(worker.run_fixture(&json!({"fixture":"return {}","operation":"search","query":"test","limit":1})).await, Err("invalid-request"));
    let mut injected = search("catalog");
    injected["source"] = json!("return {}");
    assert_eq!(worker.run_fixture(&injected).await, Err("invalid-request"));
    let caps = worker.run_fixture(&search("capabilities")).await.unwrap();
    assert_eq!(caps["result"]["process"], "undefined");
    assert_eq!(caps["result"]["fetch"], "undefined");
}

#[tokio::test]
async fn parent_deadline_stops_runaway_fixture() {
    let worker = Supervisor::new(binary(), Duration::from_millis(50), Isolation::TrustedFixture).unwrap();
    assert_eq!(worker.run_fixture(&search("loop")).await, Err("worker-timeout"));
    let worker = Supervisor::new(binary(), Duration::from_secs(5), Isolation::TrustedFixture).unwrap();
    assert_eq!(worker.run_fixture(&search("catalog")).await.unwrap()["ok"], true);
}

#[test]
fn invalid_worker_and_deadline_are_rejected() {
    assert!(Supervisor::new(Path::new("relative"), Duration::from_secs(1), Isolation::TrustedFixture).is_err());
    assert!(Supervisor::new(binary(), Duration::from_secs(60), Isolation::TrustedFixture).is_err());
    #[cfg(not(target_os = "linux"))]
    assert_eq!(Supervisor::new(binary(), Duration::from_secs(1), Isolation::LinuxNamespace).err(), Some("sandbox-unavailable"));
}

#[cfg(target_os = "linux")]
#[tokio::test]
#[ignore = "requires real user/network namespaces and Bubblewrap; dedicated CI"]
async fn linux_namespace_isolation() {
    use std::{fs, net::{TcpListener, TcpStream}};
    let tmp = tempfile::tempdir().unwrap();
    let path = tmp.path().join("host-only.txt");
    fs::write(&path, "synthetic test sentinel").unwrap();
    assert!(fs::File::open(&path).is_ok());
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let addr = listener.local_addr().unwrap();
    assert!(TcpStream::connect(addr).is_ok());
    let worker = Supervisor::new(binary(), Duration::from_secs(5), Isolation::LinuxNamespace).unwrap();
    let result = worker.isolation_probe(&path, addr).await.unwrap();
    assert_eq!(result["result"], json!({"hostFileReadable":false,"hostNetworkReachable":false,"pathPresent":false}));
    let catalog = worker.run_fixture(&search("catalog")).await.unwrap();
    assert_eq!(catalog["ok"], true);
    assert_eq!(catalog["result"]["tracks"][0]["id"], 42);
    assert_eq!(fs::read_to_string(path).unwrap(), "synthetic test sentinel");

    let (mut manager, key, package, permit) = imported::approved();
    let result = worker.run_approved_fixture(&manager, &permit, &package, &imported::search()).await.unwrap();
    imported::check_search(&result);
    let result = worker.run_approved_fixture(&manager, &permit, &package, &imported::resolve()).await.unwrap();
    imported::check_resolve(&result);
    let bypass = imported::raw_request();
    assert_eq!(worker.run_fixture(&bypass).await, Err("fixture-consent-required"));
    manager.disable(&key).unwrap();
    assert_eq!(worker.run_approved_fixture(&manager, &permit, &package, &imported::search()).await, Err("revoked"));
}

#[cfg(target_os = "linux")]
#[path = "support_imported/mod.rs"]
mod imported;
