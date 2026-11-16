//! Shared inert catalog metadata and URL canonicalization.
use super::http_transport::valid_dns_name;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::BTreeMap;
use url::{Host, Url};

pub(crate) const MAX_INDEX: usize = 256 * 1024;
const MAX_ENTRIES: usize = 1000;

fn field(value: &Value, max: usize) -> Result<String, &'static str> {
    let value = value.as_str().ok_or("invalid-field")?;
    if value.trim().is_empty() || value.len() > max || value.chars().any(char::is_control) {
        return Err("invalid-field");
    }
    Ok(value.to_owned())
}

pub(crate) fn approved_url(raw: &str, base: Option<&Url>) -> Result<Url, &'static str> {
    if raw.len() > 4096 || !raw.is_ascii() || raw.bytes().any(|b| b <= 32 || b == 127 || b == b'\\') {
        return Err("invalid-url");
    }
    let url = match base {
        Some(base) => base.join(raw),
        None => Url::parse(raw),
    }.map_err(|_| "invalid-url")?;
    let Some(Host::Domain(host)) = url.host() else { return Err("invalid-url"); };
    // The raw authority check also rejects explicitly empty userinfo.
    let authority = raw.strip_prefix("https://").or_else(|| raw.strip_prefix("//"));
    if url.scheme() != "https" || !valid_dns_name(host)
        || !url.username().is_empty() || url.password().is_some() || url.port().is_some()
        || url.fragment().is_some()
        || authority.and_then(|s| s.split(['/', '?', '#']).next()).is_some_and(|s| s.contains('@'))
    {
        return Err("invalid-url");
    }
    Ok(url)
}

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ModuleKey {
    pub repository: String,
    pub id: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CatalogEntry {
    pub key: ModuleKey,
    pub name: String,
    pub version: String,
    pub download: String,
    pub author: Option<String>,
}

pub(crate) fn entry(repository: &Url, raw: &Value) -> Result<CatalogEntry, &'static str> {
    let id = field(&raw["id"], 128)?;
    if !id.bytes().all(|b| b.is_ascii_alphanumeric() || matches!(b, b'-' | b'_' | b'.')) {
        return Err("invalid-id");
    }
    let target = raw.get("download").and_then(Value::as_str)
        .or_else(|| raw.get("file").and_then(Value::as_str)).ok_or("invalid-url")?;
    let download = approved_url(target, Some(repository))?.to_string();
    let version = field(&raw["version"], 128)?;
    Ok(CatalogEntry {
        key: ModuleKey { repository: repository.to_string(), id },
        name: field(&raw["name"], 256)?,
        version,
        download,
        author: raw.get("author").and_then(|value| field(value, 256).ok()),
    })
}

/// Pure metadata ingestion. Repository flags such as "trusted" are not grants.
pub fn parse_catalog(repository: &str, bytes: &[u8]) -> Result<Vec<CatalogEntry>, &'static str> {
    if bytes.len() > MAX_INDEX { return Err("index-limit"); }
    let repository = approved_url(repository, None)?;
    let root: Value = serde_json::from_slice(bytes).map_err(|_| "invalid-index")?;
    let object = root.as_object().ok_or("invalid-index")?;
    let mut found_category = false;
    let mut entries = BTreeMap::<ModuleKey, CatalogEntry>::new();
    let mut inspected = 0;
    for (category, list) in object {
        if !category.starts_with("category:") || matches!(category.as_str(), "category:artworks" | "category:testing" | "category:debrid_modules") {
            continue;
        }
        let Some(list) = list.as_array() else { continue; };
        found_category = true;
        for raw in list {
            inspected += 1;
            if inspected > MAX_ENTRIES { return Err("catalog-limit"); }
            // Some independent repositories use category:music and omit the
            // redundant type field. Only that explicit music category is
            // eligible; null or any other explicit type is still rejected.
            let legacy_music = category == "category:music" && raw.get("type").is_none();
            if raw["type"] != "MODULE" && !legacy_music { continue; }
            // The live index also advertises app-specific loaders as MODULE.
            // This connector is music-source only; explicit loader tags/labels
            // are not source candidates. Other metadata is never a trust grant.
            if ["tags", "labels"].iter().any(|field| raw.get(*field)
                .and_then(Value::as_array).is_some_and(|items| items.iter()
                    .any(|item| item.as_str().is_some_and(|s| s.trim().eq_ignore_ascii_case("loader"))))) {
                continue;
            }
            // Records without a concrete package URL (access-only) are not installable.
            let Ok(row) = entry(&repository, raw) else { continue; };
            if let Some(prior) = entries.get(&row.key) {
                if prior != &row { return Err("catalog-conflict"); }
                continue;
            }
            entries.insert(row.key.clone(), row);
        }
    }
    if !found_category { return Err("invalid-index"); }
    Ok(entries.into_values().collect())
}

/// Accept the repository homepage or an explicit index JSON URL.
/// Do not fetch it or follow additional indexes here.
pub(crate) fn repository_index(input: &str) -> Result<String, &'static str> {
    let mut url = approved_url(input, None)?;
    if url.query().is_some() || !input.starts_with("https://") {
        return Err("invalid-url");
    }
    if url.path().ends_with('/') {
        url = url.join("index.json").map_err(|_| "invalid-url")?;
    } else if url.path().rsplit('/').next().is_some_and(|s| !s.ends_with(".json")) {
        let path = format!("{}/index.json", url.path());
        url.set_path(&path);
    }
    if url.as_str().len() > 4096 { return Err("invalid-url"); }
    Ok(url.to_string())
}

