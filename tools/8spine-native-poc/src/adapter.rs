//! Fixture-only bridge for Harbor's MusicTrack and MusicStream JSON schema.
//! This deliberately does not register a connector or feed URLs to a media player.
use crate::handle;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::BTreeSet;

const MAX_RESULTS: usize = 50;
const FIXTURE_URL: &str = "https://example.invalid/fixture.wav";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FixtureModule {
    Catalog,
    Broker,
}

impl FixtureModule {
    fn name(self) -> &'static str {
        match self {
            Self::Catalog => "catalog",
            Self::Broker => "broker",
        }
    }

    pub fn connector_id(self) -> String {
        format!("8spine-fixture-{}", self.name())
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Quality {
    Low,
    High,
    Lossless,
}

impl Quality {
    fn value(self) -> &'static str {
        match self {
            Self::Low => "LOW",
            Self::High => "HIGH",
            Self::Lossless => "LOSSLESS",
        }
    }
}

// Keep these wire fields aligned with Harbor's actual serde camelCase data model.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HarborTrack {
    pub id: String,
    pub connector_id: String,
    pub source_id: String,
    pub playback_url: Option<String>,
    pub title: String,
    pub artist: String,
    pub album: Option<String>,
    pub artwork: String,
    pub duration_seconds: u64,
    pub duration_label: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HarborStream {
    pub url: String,
    pub mime_type: String,
    pub bitrate: u64,
}

fn source_id(id: &Value) -> Result<String, &'static str> {
    if id.as_str().is_some_and(|s| !s.trim().is_empty() && s.len() <= 512 && !s.chars().any(char::is_control))
        || id.as_i64().is_some_and(|n| (-9007199254740991..=9007199254740991).contains(&n))
    {
        Ok(id.to_string())
    } else {
        Err("invalid-track-id")
    }
}

fn qualified_id(module: FixtureModule, source: &str) -> String {
    // Hex is reversible without confusing delimiters, type, or Unicode in source IDs.
    let encoded: String = source.as_bytes().iter().map(|b| format!("{b:02x}")).collect();
    format!("{}:{encoded}", module.connector_id())
}

fn text(value: &Value, max: usize) -> Result<String, &'static str> {
    let s = value.as_str().ok_or("invalid-metadata")?.trim();
    if s.is_empty() || s.len() > max || s.chars().any(char::is_control) {
        return Err("invalid-metadata");
    }
    Ok(s.to_owned())
}

fn map_search(module: FixtureModule, raw: &Value, limit: usize) -> Result<Vec<HarborTrack>, &'static str> {
    let rows = raw["tracks"].as_array().ok_or("invalid-search-result")?;
    let total = raw["total"].as_u64().ok_or("invalid-search-result")?;
    if rows.len() > limit || rows.len() > MAX_RESULTS || total < rows.len() as u64 {
        return Err("invalid-search-result");
    }
    let mut unique = BTreeSet::new();
    let mut tracks = Vec::with_capacity(rows.len());
    for row in rows {
        let source = source_id(&row["id"])?;
        let id = qualified_id(module, &source);
        if !unique.insert(id.clone()) {
            return Err("duplicate-track-id");
        }
        let duration = row["duration"].as_f64().ok_or("invalid-duration")?;
        if !duration.is_finite() || duration <= 0.0 || duration > 24.0 * 3600.0 {
            return Err("invalid-duration");
        }
        let seconds = duration.ceil() as u64;
        let album = match row.get("album") {
            None | Some(Value::Null) => None,
            Some(value) => Some(text(value, 512)?),
        };
        tracks.push(HarborTrack {
            id,
            connector_id: module.connector_id(),
            source_id: source,
            playback_url: None,
            title: text(&row["title"], 512)?,
            artist: text(&row["artist"], 512)?,
            album,
            // Never forward an unvetted URL into Harbor's artwork loader.
            artwork: String::new(),
            duration_seconds: seconds,
            duration_label: format!("{}:{:02}", seconds / 60, seconds % 60),
        });
    }
    Ok(tracks)
}

fn map_resolve(raw: &Value, requested: &Value, quality: Quality) -> Result<HarborStream, &'static str> {
    if source_id(&raw["track"]["id"])? != source_id(requested)? {
        return Err("resolved-id-mismatch");
    }
    if raw["track"]["audioQuality"] != quality.value() {
        return Err("resolved-quality-mismatch");
    }
    if raw["streamUrl"] != FIXTURE_URL {
        return Err("fixture-url-rejected");
    }
    // Only a known, non-routable fixture descriptor. Do not guess live MIME/bitrate.
    Ok(HarborStream { url: FIXTURE_URL.to_owned(), mime_type: "audio/wav".to_owned(), bitrate: 0 })
}

pub fn search(module: FixtureModule, query: &str, limit: usize) -> Result<Vec<HarborTrack>, &'static str> {
    if !(1..=MAX_RESULTS).contains(&limit) {
        return Err("invalid-request");
    }
    let input = json!({"fixture": module.name(), "operation": "search", "query": query, "limit": limit});
    let raw = handle(input.to_string().as_bytes())?;
    map_search(module, &raw, limit)
}

pub fn resolve(module: FixtureModule, track: &HarborTrack, quality: Quality) -> Result<HarborStream, &'static str> {
    if track.connector_id != module.connector_id() || track.source_id.len() > 4096 || track.playback_url.is_some() {
        return Err("track-source-mismatch");
    }
    let requested: Value = serde_json::from_str(&track.source_id).map_err(|_| "invalid-track-id")?;
    let source = source_id(&requested)?;
    if source != track.source_id || qualified_id(module, &source) != track.id {
        return Err("track-source-mismatch");
    }
    let input = json!({"fixture": module.name(), "operation": "resolve", "trackId": requested, "quality": quality.value()});
    let raw = handle(input.to_string().as_bytes())?;
    map_resolve(&raw, &requested, quality)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn row(id: Value) -> Value {
        json!({"id": id, "title": "Fixture", "artist": "Local", "duration": 65.5, "album": "Example", "albumCover": "http://127.0.0.1/private"})
    }

    #[test]
    fn search_to_resolve_both_compiled_modules() {
        for module in [FixtureModule::Catalog, FixtureModule::Broker] {
            let tracks = search(module, "test tone", 10).unwrap();
            assert_eq!(tracks.len(), 1);
            let track = &tracks[0];
            assert_eq!(track.source_id, "42");
            assert_eq!(track.duration_seconds, 5);
            assert_eq!(track.duration_label, "0:05");
            assert_eq!(track.artwork, "");
            let wire = serde_json::to_value(track).unwrap();
            assert_eq!(wire["connectorId"], module.connector_id());
            assert_eq!(wire["sourceId"], "42");
            assert_eq!(wire["durationSeconds"], 5);
            assert!(wire["playbackUrl"].is_null());
            for quality in [Quality::Low, Quality::High, Quality::Lossless] {
                let stream = resolve(module, track, quality).unwrap();
                assert_eq!(serde_json::to_value(stream).unwrap(), json!({
                    "url": FIXTURE_URL, "mimeType": "audio/wav", "bitrate": 0
                }));
            }
        }
        let a = search(FixtureModule::Catalog, "test tone", 1).unwrap();
        let b = search(FixtureModule::Broker, "test tone", 1).unwrap();
        assert_ne!(a[0].id, b[0].id);
        assert_eq!(search(FixtureModule::Catalog, "missing track", 10).unwrap().len(), 0);
    }

    #[test]
    fn reject_cross_source_and_injected_playback_urls() {
        let mut track = search(FixtureModule::Catalog, "test tone", 1).unwrap().remove(0);
        assert_eq!(resolve(FixtureModule::Broker, &track, Quality::High), Err("track-source-mismatch"));
        track.source_id = "\"42\"".to_owned();
        assert_eq!(resolve(FixtureModule::Catalog, &track, Quality::High), Err("track-source-mismatch"));
        track.source_id = "42".to_owned();
        track.playback_url = Some("file:///secret".to_owned());
        assert_eq!(resolve(FixtureModule::Catalog, &track, Quality::High), Err("track-source-mismatch"));
    }

    #[test]
    fn typed_ids_are_distinct_and_untrusted_artwork_is_omitted() {
        let rows = json!({"tracks": [row(json!(42)), row(json!("42"))], "total": 2});
        let mapped = map_search(FixtureModule::Catalog, &rows, 2).unwrap();
        assert_ne!(mapped[0].id, mapped[1].id);
        assert_eq!(mapped[0].duration_label, "1:06");
        assert_eq!(mapped[0].album.as_deref(), Some("Example"));
        assert_eq!(mapped[0].artwork, "");
    }

    #[test]
    fn malformed_and_duplicate_results_are_rejected() {
        let module = FixtureModule::Catalog;
        assert_eq!(map_search(module, &json!({"tracks": []}), 10), Err("invalid-search-result"));
        let one = row(json!(42));
        assert_eq!(map_search(module, &json!({"tracks": [one.clone(), one.clone()], "total": 2}), 2), Err("duplicate-track-id"));
        assert_eq!(map_search(module, &json!({"tracks": [one.clone()], "total": 0}), 1), Err("invalid-search-result"));
        let mut bad = one.clone();
        bad["duration"] = json!(-5);
        assert_eq!(map_search(module, &json!({"tracks": [bad], "total": 1}), 1), Err("invalid-duration"));
        bad = one.clone();
        bad["id"] = json!(9007199254740992i64);
        assert_eq!(map_search(module, &json!({"tracks": [bad], "total": 1}), 1), Err("invalid-track-id"));
        bad = one;
        bad["title"] = json!("");
        assert_eq!(map_search(module, &json!({"tracks": [bad], "total": 1}), 1), Err("invalid-metadata"));
    }

    #[test]
    fn resolved_identity_quality_and_url_must_match() {
        let mut raw = json!({"streamUrl": FIXTURE_URL, "track": {"id": 42, "audioQuality": "HIGH"}});
        assert!(map_resolve(&raw, &json!(42), Quality::High).is_ok());
        assert_eq!(map_resolve(&raw, &json!("42"), Quality::High), Err("resolved-id-mismatch"));
        assert_eq!(map_resolve(&raw, &json!(42), Quality::Low), Err("resolved-quality-mismatch"));
        raw["streamUrl"] = json!("https://other.invalid/track");
        assert_eq!(map_resolve(&raw, &json!(42), Quality::High), Err("fixture-url-rejected"));
    }
}
