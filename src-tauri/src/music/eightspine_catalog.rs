//! Metadata-only repository import. No source execution, no playback registration.
#[allow(dead_code)]
#[path = "../../../tools/8spine-native-poc/src/http_transport.rs"]
mod http_transport;
#[allow(dead_code)]
#[path = "../../../tools/8spine-native-poc/src/catalog.rs"]
mod catalog;

use catalog::{repository_index, parse_catalog, CatalogEntry, MAX_INDEX};
use http_transport::{NetworkGrant, NetworkSession};
use serde::Serialize;
use url::Url;

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
    let parsed = Url::parse(&repository).map_err(|_| "invalid-url")?;
    let host = parsed.host_str().ok_or("invalid-url")?;
    // This grant authorizes only the one explicitly pasted metadata index.
    // It never flows to a downloaded source or registers a music connector.
    let grant = NetworkGrant::new("8spine-catalog-preview", "1", &[host])?;
    let mut session = NetworkSession::new(&grant, "8spine-catalog-preview", "1")?;
    let request = session.authorize("GET", &repository)?;
    let (status, body) = request.send_resolved_bytes(MAX_INDEX).await?;
    if status != 200 { return Err("repository-http-status"); }
    Ok(RepositoryPreview {
        entries: parse_catalog(&repository, &body)?,
        repository,
        execution_available: false,
    })
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

    #[tokio::test]
    #[ignore = "explicit public index smoke; dedicated 8SPINE CI"]
    async fn public_repository_preview() {
        let result = preview("https://8spine-modules.pages.dev/index.json").await.unwrap();
        assert_eq!(result.repository, "https://8spine-modules.pages.dev/index.json");
        assert!(!result.entries.is_empty());
        assert!(!result.execution_available);
    }
}
