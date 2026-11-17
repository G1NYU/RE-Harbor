//! Personal-use OK.ru prototype, opt-in only. Never persist or log the session.
use super::super::connector::{ConnectorHealth, HealthCell, MusicConnector};
use super::super::{duration_label, MusicConnection, MusicStream, MusicTrack};
use async_trait::async_trait;
use serde::Deserialize;
use std::time::Duration;
use url::Url;

#[derive(Default, Deserialize)]
#[serde(default)]
struct Artist { name: Option<String> }

#[derive(Default, Deserialize)]
#[serde(default, rename_all = "camelCase")]
struct Track {
    id: Option<i64>,
    name: Option<String>,
    ensemble: Option<String>,
    duration: Option<u64>,
    image_url: Option<String>,
    album_id: Option<i64>,
    all_artists: Vec<Artist>,
}
#[derive(Default, Deserialize)]
#[serde(default)]
struct Album { id: Option<i64>, name: Option<String> }
#[derive(Default, Deserialize)]
#[serde(default)]
struct Response {
    error: Option<String>,
    tracks: Vec<Track>,
    albums: Vec<Album>,
    play: Option<String>,
}

pub struct OkRuConnector {
    health: HealthCell,
    session: String,
    http: reqwest::Client,
}

impl OkRuConnector {
    pub fn from_environment() -> Option<Self> {
        if std::env::var("HARBOR_EXPERIMENTAL_OKRU").ok().as_deref() != Some("1") {
            return None;
        }
        Self::new(&std::env::var("HARBOR_OKRU_JSESSIONID").ok()?).ok()
    }

    fn new(session: &str) -> Result<Self, String> {
        let session = session.trim();
        if session.len() < 8 || session.len() > 256
            || !session.bytes().all(|b| b.is_ascii_alphanumeric() || matches!(b, b'_' | b'-' | b'.' | b'!'))
        {
            return Err("Invalid OK.ru session".into());
        }
        let http = reqwest::Client::builder()
            .timeout(Duration::from_secs(10))
            .redirect(reqwest::redirect::Policy::none())
            .build().map_err(|_| "OK.ru client unavailable")?;
        Ok(Self { health: HealthCell::new(), session: session.to_owned(), http })
    }

    async fn request(&self, route: &str, params: &[(&str, String)]) -> Result<Response, String> {
        // Fixed host, fixed routes, and no redirects keep account sessions private.
        let url = format!("https://wmf.ok.ru/{route};jsessionid={}", self.session);
        let response = self.http.get(url).query(params).send().await
            .map_err(|_| "OK.ru request failed; check session or connection")?;
        if !response.status().is_success() {
            return Err(format!("OK.ru returned HTTP {}", response.status()));
        }
        let body: Response = response.json().await
            .map_err(|_| "OK.ru returned an unsupported response")?;
        if let Some(error) = body.error.as_deref() {
            return Err(match error {
                "error.notloggedin" => "OK.ru session expired",
                "error.copyright.restriction" => "OK.ru restricts this recording",
                _ => "OK.ru rejected the request",
            }.into());
        }
        Ok(body)
    }

    fn record<T>(&self, outcome: &Result<T, String>) {
        self.health.set(if outcome.is_ok() { ConnectorHealth::Healthy } else { ConnectorHealth::Degraded });
    }

    async fn find(&self, query: &str, limit: usize) -> Result<Vec<MusicTrack>, String> {
        if query.trim().is_empty() { return Ok(Vec::new()); }
        let response = self.request("tracks", &[
            ("q", query.trim().to_owned()),
            ("start", "0".into()),
            ("count", limit.clamp(1, 50).to_string()),
            ("imgfmt", "base".into()),
        ]).await?;
        Ok(response.tracks.iter()
            .filter_map(|item| map_track(item, &response.albums))
            .take(limit.min(50)).collect())
    }

    async fn stream(&self, track: &MusicTrack) -> Result<MusicStream, String> {
        let id = track.source_id.as_deref().or_else(|| track.id.strip_prefix("okru:"))
            .ok_or("Invalid OK.ru track")?;
        if id.is_empty() || id.len() > 20 || !id.bytes().all(|b| b.is_ascii_digit()) {
            return Err("Invalid OK.ru track".into());
        }
        let response = self.request("play", &[
            ("tid", id.to_owned()), ("imgfmt", "base".into()),
        ]).await?;
        let url = safe_media(response.play.as_deref().ok_or("OK.ru did not return a playable URL")?)?;
        Ok(MusicStream { url, mime_type: "audio/mpeg".into(), bitrate: 0, http_headers: Default::default() })
    }
}

fn safe_cdn(raw: &str) -> Option<Url> {
    let url = Url::parse(raw.trim()).ok()?;
    if url.scheme() != "https" || !url.username().is_empty() || url.password().is_some()
        || !url.host_str()?.to_ascii_lowercase().ends_with(".mycdn.me")
    { return None; }
    Some(url)
}
fn safe_media(raw: &str) -> Result<String, String> {
    safe_cdn(raw).map(|url| url.to_string())
        .ok_or_else(|| "OK.ru returned an unexpected media host".into())
}
fn map_track(item: &Track, albums: &[Album]) -> Option<MusicTrack> {
    let id = item.id.filter(|id| *id > 0)?;
    let title = item.name.as_deref()?.trim();
    if title.is_empty() { return None; }
    let artist = item.all_artists.iter().filter_map(|artist| artist.name.as_deref())
        .find(|artist| !artist.trim().is_empty())
        .or(item.ensemble.as_deref()).unwrap_or("Unknown artist").trim();
    let duration_seconds = item.duration.unwrap_or(0);
    Some(MusicTrack {
        id: format!("okru:{id}"), connector_id: Some("okru".into()),
        source_id: Some(id.to_string()), playback_url: None,
        title: title.to_owned(), artist: artist.to_owned(),
        album: item.album_id.and_then(|id| albums.iter().find(|album| album.id == Some(id)))
            .and_then(|album| album.name.clone()),
        artwork: item.image_url.as_deref().and_then(safe_cdn)
            .map(|url| url.to_string()).unwrap_or_default(),
        duration_seconds, duration_label: duration_label(duration_seconds),
        explicit: None, version: None, media_kind: None,
    })
}

#[async_trait]
impl MusicConnector for OkRuConnector {
    fn id(&self) -> &str { "okru" }
    fn name(&self) -> &str { "OK.ru (Experimental)" }
    async fn search(&self, _app: &tauri::AppHandle, query: &str, limit: usize)
        -> Result<Vec<MusicTrack>, String>
    { let result = self.find(query, limit).await; self.record(&result); result }
    async fn resolve(&self, _app: &tauri::AppHandle, track: &MusicTrack)
        -> Result<MusicStream, String>
    { let result = self.stream(track).await; self.record(&result); result }
    fn health(&self) -> ConnectorHealth { self.health.get() }
    fn set_health(&self, health: ConnectorHealth) { self.health.set(health); }
    fn connection(&self) -> MusicConnection {
        let status = if self.health() == ConnectorHealth::Degraded { "error" } else { "connected" };
        MusicConnection::new("okru", self.name(), "streaming", status, &["search", "play"])
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn session_validation_prevents_path_and_query_injection() {
        assert!(OkRuConnector::new("abc12345.abc").is_ok());
        for bad in ["", "short", "abc/pathXX", "abc?queryXX", "abc#fragment", "abc\nheader"] {
            assert!(OkRuConnector::new(bad).is_err());
        }
    }
    #[test]
    fn historic_okru_result_maps_to_harbor_music_track() {
        let response: Response = serde_json::from_str(r#"{
          "tracks":[{"id":122900268582048,"name":"Babooshka","ensemble":"Kate Bush",
          "duration":209,"albumId":122881949729640,"imageUrl":"https://i.mycdn.me/i?r=abc"}],
          "albums":[{"id":122881949729640,"name":"Smash Hits Car-aoke"}]
        }"#).unwrap();
        let track = map_track(&response.tracks[0], &response.albums).unwrap();
        assert_eq!(track.id, "okru:122900268582048");
        assert_eq!(track.duration_label, "3:29");
        assert_eq!(track.album.as_deref(), Some("Smash Hits Car-aoke"));
        assert!(track.playback_url.is_none());
    }
    #[test]
    fn media_links_reject_untrusted_hosts_and_non_https() {
        assert!(safe_media("https://musicd.mycdn.me/v0/stream?md5=abc").is_ok());
        for bad in [
            "https://musicd.mycdn.me.evil.test/song",
            "http://musicd.mycdn.me/song",
            "https://user:pass@musicd.mycdn.me/song",
            "file:///etc/passwd",
        ] { assert!(safe_media(bad).is_err()); }
    }
    #[test]
    fn incomplete_results_and_untrusted_artwork_are_ignored() {
        let row: Track = serde_json::from_str(
            r#"{"id":2,"name":"Test","imageUrl":"https://evil.test/image"}"#,
        ).unwrap();
        assert_eq!(map_track(&row, &[]).unwrap().artwork, "");
        let empty: Track = serde_json::from_str(r#"{"id":3}"#).unwrap();
        assert!(map_track(&empty, &[]).is_none());
    }
}
