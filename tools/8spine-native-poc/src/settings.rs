//! Inert, bounded settings schema shared by host runner and UI contract.
// Only scalar selector/text/toggle settings; no executable callbacks or HTML.
use serde_json::{json, Map, Value};
fn text(v: &Value, max: usize) -> Result<&str, &'static str> {
    v.as_str().filter(|s| s.len() <= max && !s.chars().any(char::is_control)).ok_or("invalid-setting")
}
fn scalar(v: &Value) -> bool {
    v.as_bool().is_some() || v.as_i64().is_some_and(|n| n.abs_diff(0) <= 9007199254740991)
        || text(v,512).is_ok()
}
pub fn sanitize_schema(raw: &Value) -> Result<Value, &'static str> {
    let rows = raw.as_object().ok_or("invalid-settings")?;
    if rows.len() > 32 { return Err("settings-limit"); }
    let mut safe = Map::new();
    for (key, field) in rows {
        if key.is_empty() || key.len()>64 || !key.bytes().all(|c|c.is_ascii_alphanumeric() || c==b'_' || c==b'-')
            || matches!(key.as_str(),"__proto__"|"constructor"|"prototype") { return Err("invalid-setting-key"); }
        let kind = text(&field["type"],32)?;
        let label = text(&field["label"],256)?;
        let description = field.get("description").map(|v|text(v,1024)).transpose()?.unwrap_or("");
        let default = &field["defaultValue"];
        let mut row = json!({"type":kind,"label":label,"description":description,"defaultValue":default});
        match kind {
            "selector" => {
                let options = field["options"].as_array().filter(|a|!a.is_empty() && a.len()<=32).ok_or("invalid-options")?;
                let mut out = Vec::new();
                for option in options {
                    let label = text(&option["label"],256)?;
                    let value = &option["value"];
                    if !scalar(value) || out.iter().any(|o: &Value| o["value"]==*value) { return Err("invalid-option"); }
                    out.push(json!({"label":label,"value":value}));
                }
                if !out.iter().any(|o| o["value"]==*default) { return Err("invalid-default"); }
                row["options"] = json!(out);
            }
            "text" if text(default,512).is_ok() => {},
            "toggle" | "boolean" if default.is_boolean() => {},
            _ => return Err("unsupported-setting-type"),
        }
        safe.insert(key.clone(),row);
    }
    Ok(Value::Object(safe))
}
pub fn values(schema: &Value, chosen: &Value) -> Result<Value, &'static str> {
    let schema = schema.as_object().ok_or("invalid-settings")?;
    let chosen = chosen.as_object().ok_or("invalid-settings")?;
    if chosen.keys().any(|k| !schema.contains_key(k)) { return Err("unknown-setting"); }
    let mut out = Map::new();
    for (key, field) in schema {
        let value = chosen.get(key).unwrap_or(&field["defaultValue"]);
        let valid = match field["type"].as_str() {
            Some("selector") => field["options"].as_array().is_some_and(|a|a.iter().any(|o|o["value"]==*value)),
            Some("text") => text(value,512).is_ok(),
            Some("toggle"|"boolean") => value.is_boolean(),
            _ => false,
        };
        if !valid { return Err("invalid-setting-value"); }
        out.insert(key.clone(),value.clone());
    }
    Ok(Value::Object(out))
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn exact_options_and_defaults() {
        let schema=sanitize_schema(&json!({"quality":{"type":"selector","label":"Quality","options":[{"label":"Hi-Res","value":"HI_RES"},{"label":"CD","value":"LOSSLESS"}],"defaultValue":"HI_RES"},"fallback":{"type":"selector","label":"Fallback","options":[{"label":"Strict","value":"strict"}],"defaultValue":"strict"}})).unwrap();
        assert_eq!(values(&schema,&json!({})).unwrap(),json!({"quality":"HI_RES","fallback":"strict"}));
        assert!(values(&schema,&json!({"quality":"unknown"})).is_err());
        assert!(values(&schema,&json!({"injected":true})).is_err());
    }
}
