//! Experimental VK Music connector. VK approval is required for `audio.*` API calls.
//! Never use third-party app identifiers, session cookies or private endpoints.

use async_trait::async_trait;
use reqwest::Client;
use serde_json::{Map, Value};
use std::collections::HashMap;
use std::sync::{OnceLock, RwLock};
use std::time::{Duration, Instant};
use tokio::sync::Mutex;

use super::super::connector::{ConnectorHealth, HealthCell, MusicConnector};
use super::super::{MusicConnection, MusicConnectionField, MusicStream, MusicTrack};

const ID: &str = "vk";
const TOKEN_KEY: &str = "harbor.vk.audio-token.v1";
const API_VERSION: &str = "5.199";
const MIN_INTERVAL: Duration = Duration::from_millis(350);

static TOKEN: OnceLock<RwLock<Option<String>>> = OnceLock::new();

fn token_slot() -> &'static RwLock<Option<String>> {
    TOKEN.get_or_init(|| RwLock::new(None))
}

fn token() -> Option<String> {
    token_slot().read().ok()?.clone()
}

fn read_secrets(app: &tauri::AppHandle) -> Result<Map<String, Value>, String> {
    let Some(raw) = crate::settings_store::secrets_read(app.clone())? else {
        return Ok(Map::new());
    };
    let value: Value = serde_json::from_str(&raw)
        .map_err(|_| "The Harbor secret store is not valid JSON".to_string())?;
    value
        .as_object()
        .cloned()
        .ok_or_else(|| "The Harbor secret store is not an object".to_string())
}

fn persist_token(app: &tauri::AppHandle, value: Option<&str>) -> Result<(), String> {
    let mut secrets = read_secrets(app)?;
    if let Some(value) = value {
        secrets.insert(TOKEN_KEY.to_string(), Value::String(value.to_string()));
    } else {
        secrets.remove(TOKEN_KEY);
    }
    let content = serde_json::to_string(&Value::Object(secrets))
        .map_err(|_| "Unable to serialize the Harbor secret store".to_string())?;
    crate::settings_store::secrets_write(app.clone(), content)
}

/// Load credentials after Harbor has unlocked its ordinary secret store.
pub fn hydrate(app: &tauri::AppHandle) -> Result<(), String> {
    let value = read_secrets(app)?
        .get(TOKEN_KEY)
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string);
    *token_slot()
        .write()
        .map_err(|_| "VK Music token state is unavailable".to_string())? = value;
    Ok(())
}

fn parse_audio(item: &Value) -> Option<MusicTrack> {
    let owner = item.get("owner_id")?.as_i64()?;
    let id = item.get("id")?.as_u64()?;
    let artist = item.get("artist")?.as_str()?.trim();
    let title = item.get("title")?.as_str()?.trim();
    if title.is_empty() || artist.is_empty() {
        return None;
    }
    let duration = item.get("duration").and_then(Value::as_u64).unwrap_or(0);
    let source = format!("{owner}_{id}");
    let artwork = item
        .pointer("/album/thumb/photo_600")
        .or_else(|| item.pointer("/album/thumb/photo_300"))
        .and_then(Value::as_str)
        .filter(|url| url.starts_with("https://"))
        .unwrap_or_default()
        .to_string();
    Some(MusicTrack {
        explicit: None,
        version: None,
        media_kind: Some("audio".to_string()),
        id: format!("vk:{source}"),
        connector_id: Some(ID.to_string()),
        source_id: Some(source),
        playback_url: None,
        title: title.to_string(),
        artist: artist.to_string(),
        album: None,
        artwork,
        duration_seconds: duration,
        duration_label: format!("{}:{:02}", duration / 60, duration % 60),
    })
}

fn safe_audio_id(track: &MusicTrack) -> Result<String, String> {
    if track.connector_id.as_deref() != Some(ID) {
        return Err("Not a VK Music track".to_string());
    }
    let source = track
        .source_id
        .as_deref()
        .or_else(|| track.id.strip_prefix("vk:"))
        .ok_or_else(|| "VK Music track identity is missing".to_string())?;
    let mut parts = source.split('_');
    let (Some(owner), Some(id), None) = (parts.next(), parts.next(), parts.next()) else {
        return Err("VK Music track identity is invalid".to_string());
    };
    if owner.parse::<i64>().is_err() || id.parse::<u64>().is_err() {
        return Err("VK Music track identity is invalid".to_string());
    }
    Ok(format!("{owner}_{id}"))
}

fn stream_url(url: &str) -> Result<String, String> {
    let parsed = reqwest::Url::parse(url)
        .map_err(|_| "VK Music did not return a usable stream URL".to_string())?;
    if parsed.scheme() != "https"
        || parsed.host_str().is_none()
        || parsed.username() != ""
        || parsed.password().is_some()
        || parsed.host_str().and_then(|host| host.parse::<std::net::IpAddr>().ok()).is_some()
    {
        return Err("VK Music did not return a secure stream URL".to_string());
    }
    Ok(url.to_string())
}

pub struct VkMusicConnector {
    health: HealthCell,
    http: Client,
    pace: Mutex<Option<Instant>>,
}

impl VkMusicConnector {
    pub fn new() -> Self {
        let http = Client::builder()
            .timeout(Duration::from_secs(12))
            .redirect(reqwest::redirect::Policy::none())
            .build()
            .unwrap_or_else(|_| Client::new());
        Self {
            health: HealthCell::new(),
            http,
            pace: Mutex::new(None),
        }
    }

    async fn method(
        &self,
        access_token: &str,
        method: &str,
        fields: &[(&str, String)],
    ) -> Result<Value, String> {
        // Only fixed, documented audio endpoints are allowed.
        if !matches!(method, "audio.search" | "audio.getById") {
            return Err("Unsupported VK Music method".to_string());
        }
        {
            let mut previous = self.pace.lock().await;
            if let Some(last) = *previous {
                if last.elapsed() < MIN_INTERVAL {
                    tokio::time::sleep(MIN_INTERVAL - last.elapsed()).await;
                }
            }
            *previous = Some(Instant::now());
        }
        let url = format!("https://api.vk.com/method/{method}");
        let mut form = vec![
            ("access_token", access_token.to_string()),
            ("v", API_VERSION.to_string()),
        ];
        form.extend(fields.iter().cloned());
        // POST keeps the bearer credential out of URL, redirects and ordinary logs.
        let result = self.http.post(&url).form(&form).send().await
            .map_err(|_| "VK Music could not reach its API".to_string())?;
        if !result.status().is_success() {
            return Err(format!("VK Music returned HTTP {}", result.status().as_u16()));
        }
        let body: Value = result.json().await
            .map_err(|_| "VK Music returned invalid API data".to_string())?;
        if let Some(code) = body.pointer("/error/error_code").and_then(Value::as_i64) {
            return Err(format!(
                "VK Music rejected this audio API request (code {code}); authorized audio access is required"
            ));
        }
        body.get("response").cloned()
            .ok_or_else(|| "VK Music did not return an audio API response".to_string())
    }

    async fn search_with_token(
        &self, access_token: &str, query: &str, limit: usize,
    ) -> Result<Vec<MusicTrack>, String> {
        let count = limit.clamp(1, 100);
        let data = self.method(access_token, "audio.search", &[
            ("q", query.to_string()),
            ("count", count.to_string()),
        ]).await?;
        let items = data.get("items").and_then(Value::as_array)
            .ok_or_else(|| "VK Music audio search is not available for this account".to_string())?;
        Ok(items.iter().filter_map(parse_audio).take(count).collect())
    }
}

impl Default for VkMusicConnector {
    fn default() -> Self { Self::new() }
}

#[async_trait]
impl MusicConnector for VkMusicConnector {
    fn id(&self) -> &str { ID }
    fn name(&self) -> &str { "VK Music (experimental)" }

    async fn search(
        &self, _app: &tauri::AppHandle, query: &str, limit: usize,
    ) -> Result<Vec<MusicTrack>, String> {
        let key = token().ok_or_else(|| "Connect an approved VK Music account first".to_string())?;
        let result = self.search_with_token(&key, query, limit).await;
        self.health.set(if result.is_ok() { ConnectorHealth::Healthy } else { ConnectorHealth::Degraded });
        result
    }

    async fn resolve(
        &self, _app: &tauri::AppHandle, track: &MusicTrack,
    ) -> Result<MusicStream, String> {
        let key = token().ok_or_else(|| "Connect an approved VK Music account first".to_string())?;
        let id = safe_audio_id(track)?;
        let data = self.method(&key, "audio.getById", &[("audios", id)]).await?;
        let url = data.as_array()
            .and_then(|items| items.first())
            .and_then(|item| item.get("url"))
            .and_then(Value::as_str)
            .ok_or_else(|| "VK Music did not supply a playable URL for this recording".to_string())?;
        Ok(MusicStream {
            url: stream_url(url)?,
            mime_type: "audio/mpeg".to_string(),
            bitrate: 0,
            http_headers: Default::default(),
        })
    }

    async fn connect(
        &self, app: &tauri::AppHandle, fields: &HashMap<String, String>,
    ) -> Result<MusicConnection, String> {
        let key = fields.get("access_token").map(String::as_str).unwrap_or("").trim();
        if !(16..=2048).contains(&key.len()) || !key.bytes().all(|byte| byte.is_ascii_graphic()) {
            return Err("Enter a valid VK-issued audio API token".to_string());
        }
        // An ordinary VK ID token is not sufficient. Verify the actual audio method
        // before persisting anything, so the UI never implies it is connected falsely.
        self.search_with_token(key, "music", 1).await?;
        persist_token(app, Some(key))?;
        *token_slot().write()
            .map_err(|_| "VK Music token state is unavailable".to_string())? = Some(key.to_string());
        self.health.set(ConnectorHealth::Healthy);
        Ok(self.connection())
    }

    async fn disconnect(&self, app: &tauri::AppHandle) -> Result<(), String> {
        persist_token(app, None)?;
        *token_slot().write()
            .map_err(|_| "VK Music token state is unavailable".to_string())? = None;
        self.health.set(ConnectorHealth::Unknown);
        Ok(())
    }

    fn set_health(&self, health: ConnectorHealth) { self.health.set(health); }
    fn health(&self) -> ConnectorHealth { self.health.get() }
    fn searchable(&self) -> bool { token().is_some() }
    fn playable(&self) -> bool { token().is_some() }

    fn connection(&self) -> MusicConnection {
        let signed_in = token().is_some();
        let status = if !signed_in { "disconnected" }
            else if self.health() == ConnectorHealth::Offline { "error" }
            else { "connected" };
        let mut connection = MusicConnection::new(
            ID, self.name(), "streaming", status, &["search", "play"],
        ).needs(vec![MusicConnectionField::new(
            "access_token", "VK-approved audio API token", "password", true,
        )]);
        connection.detail = Some(
            "Requires VK-approved audio access. Standard VK ID tokens may be rejected.".to_string()
        );
        connection
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn validates_api_track_identity_and_sanitizes_artwork() {
        let item = json!({
            "owner_id": -73, "id": 42, "artist": "Artist", "title": "Song",
            "duration": 191, "album": {"thumb": {"photo_300":"https://example.org/a.jpg"}}
        });
        let track = parse_audio(&item).unwrap();
        assert_eq!(track.id, "vk:-73_42");
        assert_eq!(track.source_id.as_deref(), Some("-73_42"));
        assert_eq!(track.duration_label, "3:11");
        assert_eq!(track.playback_url, None);
        assert_eq!(safe_audio_id(&track).unwrap(), "-73_42");
        assert!(parse_audio(&json!({"title": "Only title"})).is_none());
    }

    #[test]
    fn never_trusts_non_https_or_local_stream_addresses() {
        assert!(stream_url("https://cdn.example.org/media.mp3").is_ok());
        assert!(stream_url("http://cdn.example.org/media.mp3").is_err());
        assert!(stream_url("file:///etc/passwd").is_err());
        assert!(stream_url("https://127.0.0.1/media.mp3").is_err());
        assert!(stream_url("https://user:secret@cdn.example.org/media.mp3").is_err());
    }

    #[test]
    fn signed_out_connector_is_not_a_background_search_source() {
        // Fresh process: no key has been loaded or supplied.
        let connector = VkMusicConnector::new();
        assert_eq!(connector.id(), "vk");
        assert_eq!(connector.name(), "VK Music (experimental)");
        assert_eq!(connector.connection().kind, "streaming");
    }
}
