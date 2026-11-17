//! Personal-use OK.ru prototype, opt-in only. Never persist or log the session.
use super::super::connector::{ConnectorHealth, HealthCell, MusicConnector};
use super::super::{duration_label, MusicConnection, MusicConnectionField, MusicStream, MusicTrack};
use async_trait::async_trait;
use serde::Deserialize;
use serde_json::Value;
use std::collections::HashMap;
use std::sync::RwLock;
use std::time::Duration;
use url::Url;

#[derive(Debug, Default, Deserialize)]
#[serde(default)]
struct Artist { name: Option<String> }

#[derive(Debug, Default, Deserialize)]
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
#[derive(Debug, Default, Deserialize)]
#[serde(default)]
struct Album { id: Option<i64>, name: Option<String> }
#[derive(Debug, Default, Deserialize)]
#[serde(default)]
struct Response {
    error: Option<String>,
    tracks: Vec<Track>,
    albums: Vec<Album>,
    play: Option<String>,
}

pub struct OkRuConnector {
    health: HealthCell,
    session: RwLock<Option<String>>,
    http: reqwest::Client,
}

impl OkRuConnector {
    pub fn from_environment() -> Option<Self> {
        if std::env::var("HARBOR_EXPERIMENTAL_OKRU").ok().as_deref() != Some("1") {
            return None;
        }
        Self::new(std::env::var("HARBOR_OKRU_JSESSIONID").ok().as_deref()).ok()
    }

    fn validate_session(session: &str) -> Result<String, String> {
        let session = session.trim();
        if session.len() < 8 || session.len() > 256
            || !session.bytes().all(|b| b.is_ascii_alphanumeric() || matches!(b, b'_' | b'-' | b'.' | b'!'))
        {
            return Err("Invalid OK.ru session".into());
        }
        Ok(session.to_owned())
    }

    fn new(session: Option<&str>) -> Result<Self, String> {
        let session = session.map(Self::validate_session).transpose()?;
        let http = reqwest::Client::builder()
            .timeout(Duration::from_secs(10))
            .redirect(reqwest::redirect::Policy::none())
            .build().map_err(|_| "OK.ru client unavailable")?;
        Ok(Self { health: HealthCell::new(), session: RwLock::new(session), http })
    }

    fn configured(&self) -> bool {
        self.session.read().is_ok_and(|session| session.is_some())
    }

    fn set_session(&self, raw: &str) -> Result<(), String> {
        let next = Self::validate_session(raw)?;
        *self.session.write().map_err(|_| "OK.ru session storage unavailable")? = Some(next);
        self.health.set(ConnectorHealth::Unknown);
        Ok(())
    }

    fn forget_session(&self) -> Result<(), String> {
        *self.session.write().map_err(|_| "OK.ru session storage unavailable")? = None;
        self.health.set(ConnectorHealth::Unknown);
        Ok(())
    }

    async fn request(&self, route: &str, params: &[(&str, String)]) -> Result<Response, String> {
        let session = self.session.read()
            .map_err(|_| "OK.ru session storage unavailable")?
            .clone().ok_or("Connect OK.ru in Music Connections first")?;
        self.request_with_session(&session, route, params).await
    }

    async fn request_with_session(
        &self,
        session: &str,
        route: &str,
        params: &[(&str, String)],
    ) -> Result<Response, String> {
        // The caller controls neither the host nor the route; redirects are disabled.
        let url = format!("https://wmf.ok.ru/{route};jsessionid={session}");
        let mut request = match route {
            "play" => self.http.post(url),
            "queryMixedSuggestions" => self.http.get(url),
            _ => return Err("Unsupported OK.ru music API route".into()),
        };
        request = request.query(params)
            // Match the authenticated music service: session both in the fixed path
            // and as a cookie, never sent to redirects or external media hosts.
            .header(reqwest::header::COOKIE, format!("jsessionid={session}"))
            .header(reqwest::header::USER_AGENT, "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36")
            .header(reqwest::header::ACCEPT, "application/json, text/javascript, */*; q=0.01")
            .header(reqwest::header::ACCEPT_LANGUAGE, "ru-RU,ru;q=0.9,en;q=0.8")
            .header(reqwest::header::ORIGIN, "https://ok.ru")
            .header(
                reqwest::header::REFERER,
                if route == "play" {
                    let id = params.iter().find(|(key, _)| *key == "tid")
                        .map(|(_, id)| id.as_str()).unwrap_or("");
                    format!("https://ok.ru/music/profile/{id}")
                } else {
                    "https://ok.ru/".to_owned()
                },
            )
            .header("X-Requested-With", "XMLHttpRequest");
        if route == "play" {
            // WMF's browser endpoint is a POST with an empty form body.
            request = request
                .header(reqwest::header::CONTENT_TYPE, "application/x-www-form-urlencoded")
                .body(String::new());
        }
        let response = request.send().await
            .map_err(|_| "OK.ru request failed; check session or connection")?;
        if !response.status().is_success() {
            return Err(format!("OK.ru returned HTTP {}", response.status()));
        }
        let json: Value = response.json().await
            .map_err(|_| "OK.ru returned an unsupported response")?;
        parse_response(route, json)
    }

    fn record<T>(&self, outcome: &Result<T, String>) {
        self.health.set(if outcome.is_ok() { ConnectorHealth::Healthy } else { ConnectorHealth::Degraded });
    }

    async fn find(&self, query: &str, limit: usize) -> Result<Vec<MusicTrack>, String> {
        if query.trim().is_empty() { return Ok(Vec::new()); }
        let response = self.request("queryMixedSuggestions", &[
            ("q", query.trim().to_owned()),
            ("client", "web".into()),
            ("locale", "ru".into()),
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
            ("tid", id.to_owned()),
            ("ctx", "my|1".into()),
            ("client", "web".into()),
            ("locale", "ru".into()),
            ("imgfmt", "base".into()),
        ]).await?;
        let url = safe_media(response.play.as_deref().ok_or("OK.ru did not return a playable URL")?)?;
        Ok(MusicStream { url, mime_type: "audio/mpeg".into(), bitrate: 0, http_headers: Default::default() })
    }
}

fn parse_response(route: &str, json: Value) -> Result<Response, String> {
    if let Some(error) = json.get("error").and_then(Value::as_str) {
        return Err(match error {
            "error.notloggedin" => "OK.ru session expired",
            "error.copyright.restriction" => "OK.ru restricts this recording",
            _ => "OK.ru rejected the request",
        }.into());
    }
    if !json.is_object() {
        return Err("OK.ru returned an unsupported response".into());
    }
    let mut response: Response = serde_json::from_value(json.clone())
        .map_err(|_| "OK.ru returned an unsupported response".to_string())?;
    if route == "queryMixedSuggestions" && response.tracks.is_empty() {
        let mut matching = Vec::new();
        collect_suggested_tracks(&json, 0, &mut matching);
        response.tracks = matching;
    }
    Ok(response)
}

fn collect_suggested_tracks(json: &Value, depth: usize, matches: &mut Vec<Track>) {
    if depth > 6 || matches.len() >= 50 {
        return;
    }
    match json {
        Value::Array(items) => {
            for item in items.iter().take(100) {
                collect_suggested_tracks(item, depth + 1, matches);
                if matches.len() >= 50 { break; }
            }
        }
        Value::Object(object) => {
            // Accept track-shaped objects only, never artist/album suggestions.
            if json.get("duration").and_then(Value::as_u64).unwrap_or(0) > 0
                && json.get("id").and_then(Value::as_i64).unwrap_or(0) > 0
                && json.get("name").and_then(Value::as_str).is_some()
            {
                if let Ok(track) = serde_json::from_value::<Track>(json.clone()) {
                    if !matches.iter().any(|known| known.id == track.id) {
                        matches.push(track);
                    }
                }
            }
            for key in ["tracks", "track", "suggestions", "items", "results", "data", "result"] {
                if let Some(value) = object.get(key) {
                    collect_suggested_tracks(value, depth + 1, matches);
                }
            }
        }
        _ => {}
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
    fn searchable(&self) -> bool { self.configured() }
    fn playable(&self) -> bool { self.configured() }

    async fn connect(
        &self,
        _app: &tauri::AppHandle,
        fields: &HashMap<String, String>,
    ) -> Result<MusicConnection, String> {
        let session = Self::validate_session(
            fields.get("session").ok_or("Enter your OK.ru session ID")?,
        )?;
        // Verify that the new session can actually reach search BEFORE replacing
        // an already usable session. Empty results are acceptable; invalid
        // auth, redirects and changed response schemas are not.
        self.request_with_session(&session, "queryMixedSuggestions", &[
            ("q", "music".to_string()),
            ("client", "web".to_string()),
            ("locale", "ru".to_string()),
        ]).await?;
        self.set_session(&session)?;
        self.health.set(ConnectorHealth::Healthy);
        Ok(self.connection())
    }

    async fn disconnect(&self, _app: &tauri::AppHandle) -> Result<(), String> {
        self.forget_session()
    }

    fn connection(&self) -> MusicConnection {
        let status = if self.configured() { "connected" } else { "disconnected" };
        let mut connection = MusicConnection::new(
            "okru", self.name(), "streaming", status, &["search", "play"],
        ).needs(vec![
            MusicConnectionField::new("session", "Own OK.ru session ID", "password", true),
        ]);
        connection.detail = Some(
            "Experimental. Session stays in memory only and is forgotten on restart.".into(),
        );
        if self.configured() && self.health() == ConnectorHealth::Degraded {
            connection.error = Some("Last OK.ru request failed; check the session or service.".into());
        }
        connection
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn session_validation_prevents_path_and_query_injection() {
        assert!(OkRuConnector::new(Some("abc12345.abc")).is_ok());
        for bad in ["", "short", "abc/pathXX", "abc?queryXX", "abc#fragment", "abc\nheader"] {
            assert!(OkRuConnector::new(Some(bad)).is_err());
        }
    }
    #[test]
    fn session_can_be_connected_and_disconnected_without_being_exposed() {
        let connector = OkRuConnector::new(None).unwrap();
        assert!(!connector.searchable());
        assert!(!connector.playable());
        assert_eq!(connector.connection().status, "disconnected");
        assert_eq!(connector.connection().needs[0].kind, "password");
        connector.set_session("abc12345.abc").unwrap();
        assert!(connector.searchable());
        assert!(connector.playable());
        let details = serde_json::to_string(&connector.connection()).unwrap();
        assert!(!details.contains("abc12345.abc"));
        assert_eq!(connector.connection().status, "connected");
        connector.forget_session().unwrap();
        assert!(!connector.searchable());
        assert_eq!(connector.connection().status, "disconnected");
    }

    #[test]
    fn invalid_replacement_does_not_override_a_working_session() {
        let connector = OkRuConnector::new(Some("sessionABC123")).unwrap();
        assert!(connector.set_session("bad/session").is_err());
        assert!(connector.configured());
    }

    #[test]
    fn connection_probe_detects_invalid_sessions_and_changed_search_schema() {
        let rejected = serde_json::json!({"error":"error.notloggedin"});
        assert!(parse_response("queryMixedSuggestions", rejected).unwrap_err().contains("expired"));
        let malformed = serde_json::json!(["unexpected", "response"]);
        assert!(parse_response("queryMixedSuggestions", malformed).unwrap_err().contains("unsupported"));
        let empty = serde_json::json!({"suggestions":[]});
        assert_eq!(parse_response("queryMixedSuggestions", empty).unwrap().tracks.len(), 0);
    }
    #[test]
    fn a_playback_response_does_not_need_the_search_results_field() {
        let playback = serde_json::json!({
            "play":"https://musicd.mycdn.me/v0/stream?md5=example"
        });
        assert!(parse_response("play", playback).unwrap().play.is_some());
    }
    #[test]
    fn modern_search_discovers_nested_tracks_without_taking_album_suggestions() {
        let json = serde_json::json!({"suggestions": [
            {"id":42, "name":"Artist only"},
            {"track":{"id":125295703372099_i64,"name":"Demo Track","ensemble":"Demo Artist","duration":106}},
            {"track":{"id":125295703372099_i64,"name":"Demo Track","duration":106}},
            {"track":{"id":55,"name":"Another Track","duration":180}}
        ]});
        let parsed = parse_response("queryMixedSuggestions", json).unwrap();
        assert_eq!(parsed.tracks.len(), 2);
        assert_eq!(map_track(&parsed.tracks[0], &parsed.albums).unwrap().duration_seconds, 106);
    }
    #[test]
    fn browser_play_response_preserves_the_track_metadata_shape() {
        let json = serde_json::json!({
            "play":"https://musicd.mycdn.me/v0/stream?md5=example",
            "image":"https://i.mycdn.me/i?r=abc",
            "subscribed":false, "albums":[{"id":1,"name":"Test"}],
            "friend":{"name":"Example"}, "umaPayload":"{}",
            "track":{"id":125295703372099_i64,"ensemble":"Demo","duration":106}
        });
        let response = parse_response("play", json).unwrap();
        assert!(response.play.is_some());
        assert_eq!(response.albums.len(), 1);
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
