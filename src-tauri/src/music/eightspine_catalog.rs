//! Metadata-only repository import. No source execution, no playback registration.
#[allow(dead_code)]
#[path = "../../../tools/8spine-native-poc/src/http_transport.rs"]
mod http_transport;
#[allow(dead_code)]
#[path = "../../../tools/8spine-native-poc/src/catalog.rs"]
mod catalog;

#[path = "../../../tools/8spine-native-poc/src/module_manager/source_format.rs"]
mod source_format;

use catalog::{approved_url, repository_index, parse_catalog, CatalogEntry, MAX_INDEX};
use sha2::{Digest, Sha256};
use http_transport::{NetworkGrant, NetworkSession};
use serde::Serialize;

const MAX_PACKAGE: usize = 2 * 1024 * 1024;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RepositoryPreview {
    repository: String,
    entries: Vec<CatalogEntry>,
    execution_available: bool,
}

#[tauri::command]
pub async fn music_8spine_preview_repository(url: String) -> Result<RepositoryPreview, String> {
    preview(&url).await.map_err(str::to_owned)
}

async fn preview(input: &str) -> Result<RepositoryPreview, &'static str> {
    let repository = repository_index(input)?;
    let (status, body) = fetch_exact(&repository, MAX_INDEX).await?;
    if status != 200 { return Err("repository-http-status"); }
    Ok(RepositoryPreview {
        entries: parse_catalog(&repository, &body)?,
        repository,
        execution_available: false,
    })
}

// Only the explicit index or selected package URL may reach this host-only
// retrieval helper. No redirects, credentials, proxy or local addresses.
async fn fetch_exact(url: &str, limit: usize) -> Result<(u16, Vec<u8>), &'static str> {
    let parsed = approved_url(url, None)?;
    if parsed.as_str() != url { return Err("invalid-url"); }
    let host = parsed.host_str().ok_or("invalid-url")?;
    let version = format!("{:x}", Sha256::digest(url.as_bytes()));
    let grant = NetworkGrant::new("8spine-explicit-import", &version, &[host])?;
    let mut session = NetworkSession::new(&grant, "8spine-explicit-import", &version)?;
    session.authorize("GET", url)?.send_resolved_bytes(limit).await
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PackageInspection {
    entry: CatalogEntry,
    fingerprint: String,
    format: &'static str,
    execution_available: bool,
}

fn selected_entry<'a>(catalog: &'a RepositoryPreview, expected: &CatalogEntry) -> Result<&'a CatalogEntry, &'static str> {
    if catalog.repository != expected.key.repository { return Err("catalog-changed"); }
    let row = catalog.entries.iter().find(|row| row.key == expected.key).ok_or("catalog-entry-missing")?;
    if row != expected { return Err("catalog-changed"); }
    Ok(row)
}

fn inspect_bytes(entry: CatalogEntry, bytes: &[u8]) -> Result<PackageInspection, &'static str> {
    if bytes.is_empty() || bytes.len() > MAX_PACKAGE { return Err("package-limit"); }
    let format = if bytes.starts_with(b"8SM1.") {
        "packed8sm1"
    } else if source_format::module_body(bytes).is_ok() {
        "javascript-candidate"
    } else {
        "unknown"
    };
    Ok(PackageInspection {
        entry,
        fingerprint: format!("{:x}", Sha256::digest(bytes)),
        format,
        execution_available: false,
    })
}

#[tauri::command]
pub async fn music_8spine_inspect_source(entry: CatalogEntry) -> Result<PackageInspection, String> {
    inspect_source(entry).await.map_err(str::to_owned)
}

async fn inspect_source(expected: CatalogEntry) -> Result<PackageInspection, &'static str> {
    // Re-read only the exact selected repository and compare every catalog
    // field, including version and URL, before touching the package.
    let catalog = preview(&expected.key.repository).await?;
    let row = selected_entry(&catalog, &expected)?;
    let (status, bytes) = fetch_exact(&row.download, MAX_PACKAGE).await?;
    if status != 200 { return Err("package-http-status"); }
    inspect_bytes(row.clone(), &bytes)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn preview_rejects_private_and_non_https_before_network() {
        for url in ["http://example.com/index.json", "https://127.0.0.1/index.json",
            "https://example.com/index.json?secret=1", "https://user@example.com/index.json"] {
            assert!(preview(url).await.is_err());
        }
    }

    #[test]
    fn inspection_is_inert_and_bound_to_exact_catalog_entry() {
        let repository = "https://example.com/index.json";
        let entries = parse_catalog(repository, br#"{"category:modules":[{"type":"MODULE","id":"fixture","name":"Fixture","version":"1","download":"fixture.js"}]}"#).unwrap();
        let expected = entries[0].clone();
        let catalog = RepositoryPreview { repository: repository.to_owned(), entries, execution_available: false };
        assert!(selected_entry(&catalog, &expected).is_ok());
        let mut changed = expected.clone();
        changed.version = "2".to_owned();
        assert_eq!(selected_entry(&catalog, &changed).err(), Some("catalog-changed"));
        changed = expected.clone();
        changed.download = "https://other.example.com/fixture.js".to_owned();
        assert_eq!(selected_entry(&catalog, &changed).err(), Some("catalog-changed"));
        for (bytes, format) in [
            (b"return {};".as_slice(), "javascript-candidate"),
            (b"8SM1.opaque".as_slice(), "packed8sm1"),
            (b"<html>".as_slice(), "unknown"),
        ] {
            let package = inspect_bytes(expected.clone(), bytes).unwrap();
            assert_eq!(package.format, format);
            assert!(!package.execution_available);
            assert_eq!(package.fingerprint.len(), 64);
        }
        assert_eq!(inspect_bytes(expected, &[]).err(), Some("package-limit"));
    }

    #[tokio::test]
    #[ignore = "explicit public index smoke; dedicated 8SPINE CI"]
    async fn public_repository_preview() {
        let result = preview("https://8spine-modules.pages.dev/index.json").await.unwrap();
        assert_eq!(result.repository, "https://8spine-modules.pages.dev/index.json");
        assert!(!result.entries.is_empty());
        assert!(!result.execution_available);
        let entry = result.entries.into_iter().find(|row| row.key.id == "soundcloud-direct").expect("known public source");
        assert_eq!(entry.download, "https://8spine-modules.pages.dev/modules/Soundcloud.8spine");
        let package = inspect_source(entry).await.unwrap();
        assert!(!package.execution_available);
        assert_eq!(package.fingerprint.len(), 64);
    }
}
