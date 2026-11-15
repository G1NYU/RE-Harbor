use harbor_8spine_native_poc::module_manager::{ModuleManager, ModuleKey, ModulePermit, PackageFormat, parse_catalog};
use serde_json::{json, Value};

const SOURCE: &str = include_str!("../../fixtures/imported.js");

pub fn approved() -> (ModuleManager, ModuleKey, Vec<u8>, ModulePermit) {
    let repo = "https://modules.example.com/index.json";
    let raw = json!({"category:modules":[{"id":"imported-fixture","name":"Imported fixture","version":"1","type":"MODULE","download":"fixture.8spine"}]});
    let row = parse_catalog(repo, raw.to_string().as_bytes()).unwrap().remove(0);
    let mut manager = ModuleManager::default();
    manager.add_repository(repo).unwrap();
    let package = format!("export const MODULE = \x60{SOURCE}\x60;").into_bytes();
    assert_eq!(manager.stage(&row, &package), Ok(PackageFormat::JavascriptCandidate));
    assert_eq!(manager.permit(&row.key, &package).err(), Some("disabled"));
    let sha = manager.get(&row.key).unwrap().fingerprint().to_owned();
    // Synthetic approval only; no request is sent to this host.
    manager.approve(&row.key, &sha, &["api.example.com"]).unwrap();
    let permit = manager.permit(&row.key, &package).unwrap();
    (manager, row.key, package, permit)
}

pub fn search() -> Value { json!({"operation":"search","query":"test tone","limit":10}) }
pub fn resolve() -> Value { json!({"operation":"resolve","trackId":73,"quality":"HIGH"}) }
pub fn raw_request() -> Value {
    let mut req = search();
    req["fixture"] = json!("imported-fixture");
    req["source"] = json!(SOURCE);
    req
}
pub fn check_search(value: &Value) {
    assert_eq!(value["ok"], true);
    assert_eq!(value["result"]["tracks"][0]["id"], 73);
}
pub fn check_resolve(value: &Value) {
    assert_eq!(value["ok"], true);
    assert_eq!(value["result"]["streamUrl"], "https://example.invalid/fixture.wav");
    assert_eq!(value["result"]["track"]["id"], 73);
}
