//! Test-only bridge to the compiled-in 8SPINE fixtures, never a production connector.
use super::connector::{ConnectorHealth, MusicConnector};
use super::{MusicStream, MusicTrack};
use async_trait::async_trait;
use serde_json::{json, Value};
use std::{path::PathBuf, process::Stdio, time::Duration};
use tokio::io::{AsyncReadExt, AsyncWriteExt};

const MAX_INPUT: usize = 8 * 1024;
const MAX_OUTPUT: usize = 256 * 1024;
const ID: &str = "8spine-fixture-catalog";

struct FixtureConnector {
    worker: PathBuf,
}

impl FixtureConnector {
    async fn call(&self, request: Value) -> Result<Value, String> {
        let input = serde_json::to_vec(&request).map_err(|_| "invalid-request")?;
        if input.len() > MAX_INPUT || !self.worker.is_absolute() {
            return Err("invalid-request".to_owned());
        }
        let mut command = tokio::process::Command::new(&self.worker);
        command.arg("--harbor-adapter-fixture")
            .env_clear()
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .kill_on_drop(true);
        #[cfg(windows)]
        if let Some(root) = std::env::var_os("SystemRoot") {
            command.env("SystemRoot", root);
        }
        let mut child = command.spawn().map_err(|_| "fixture-spawn")?;
        let mut stdin = child.stdin.take().ok_or("fixture-stdin")?;
        let stdout = child.stdout.take().ok_or("fixture-stdout")?;
        let mut out = Vec::new();
        tokio::time::timeout(Duration::from_secs(5), async {
            stdin.write_all(&input).await.map_err(|_| "fixture-input")?;
            drop(stdin);
            stdout.take((MAX_OUTPUT + 1) as u64).read_to_end(&mut out)
                .await.map_err(|_| "fixture-output")?;
            if out.len() > MAX_OUTPUT { return Err("fixture-output-limit"); }
            if !child.wait().await.map_err(|_| "fixture-wait")?.success() {
                return Err("fixture-exit");
            }
            Ok::<(), &'static str>(())
        }).await.map_err(|_| "fixture-timeout")??;
        let response: Value = serde_json::from_slice(&out).map_err(|_| "fixture-output")?;
        if response["ok"] != true { return Err("fixture-rejected".to_owned()); }
        response.get("result").cloned().ok_or_else(|| "fixture-output".to_owned())
    }

    async fn search_fixture(&self, query: &str, limit: usize) -> Result<Vec<MusicTrack>, String> {
        let tracks: Vec<MusicTrack> = serde_json::from_value(self.call(json!({
            "fixture": "catalog", "operation": "search", "query": query, "limit": limit
        })).await?).map_err(|_| "fixture-track-schema")?;
        if tracks.len() > limit || tracks.iter().any(|t| t.connector_id.as_deref() != Some(ID)
            || !t.id.starts_with("8spine-fixture-catalog:") || t.playback_url.is_some() || !t.artwork.is_empty())
        {
            return Err("fixture-track-rejected".to_owned());
        }
        Ok(tracks)
    }

    async fn resolve_descriptor(&self, track: &MusicTrack) -> Result<MusicStream, String> {
        let stream: MusicStream = serde_json::from_value(self.call(json!({
            "fixture": "catalog", "operation": "resolve", "track": track, "quality": "HIGH"
        })).await?).map_err(|_| "fixture-stream-schema")?;
        if stream.url != "https://example.invalid/fixture.wav" || !stream.http_headers.is_empty() {
            return Err("fixture-stream-rejected".to_owned());
        }
        Ok(stream)
    }
}

#[async_trait]
impl MusicConnector for FixtureConnector {
    fn id(&self) -> &str { ID }
    fn name(&self) -> &str { "8SPINE development fixture" }
    fn health(&self) -> ConnectorHealth { ConnectorHealth::Unknown }
    fn playable(&self) -> bool { false }

    async fn search(&self, _app: &tauri::AppHandle, query: &str, limit: usize) -> Result<Vec<MusicTrack>, String> {
        self.search_fixture(query, limit).await
    }

    async fn resolve(&self, _app: &tauri::AppHandle, _track: &MusicTrack) -> Result<MusicStream, String> {
        Err("Development fixture is not playable".to_owned())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use super::super::registry::ConnectorRegistry;

    #[tokio::test]
    #[ignore = "requires the separately built trusted fixture worker; dedicated CI only"]
    async fn native_fixture_registration() {
        let worker = PathBuf::from(std::env::var_os("HARBOR_8SPINE_TEST_WORKER").expect("fixture worker path"));
        assert!(worker.is_file() && worker.is_absolute());
        let connector = FixtureConnector { worker: worker.clone() };
        let registry = ConnectorRegistry::new();
        registry.register(Box::new(FixtureConnector { worker })).unwrap();
        let registered = registry.get(ID).expect("test source registered");
        assert!(!registered.playable());
        assert!(registered.searchable());
        assert_eq!(registry.health().len(), 1);
        let tracks = connector.search_fixture("test tone", 10).await.unwrap();
        assert_eq!(tracks.len(), 1);
        assert_eq!(tracks[0].source_id.as_deref(), Some("42"));
        assert_eq!(tracks[0].duration_seconds, 5);
        let stream = connector.resolve_descriptor(&tracks[0]).await.unwrap();
        assert_eq!(stream.url, "https://example.invalid/fixture.wav");
        let mut wrong = tracks[0].clone();
        wrong.source_id = Some("\"42\"".to_owned());
        assert!(connector.resolve_descriptor(&wrong).await.is_err());
        // The descriptor URL is intentionally non-routable. Only the trusted
        // harness may map this exact fixture identity to generated local audio.
        // No module-provided URL or file path reaches libmpv.
        assert_eq!(tracks[0].source_id.as_deref(), Some("42"));
        assert_eq!(stream.mime_type, "audio/wav");
        #[cfg(not(target_os = "android"))]
        play_fixture_audio(&stream).await;

    }

    #[cfg(not(target_os = "android"))]
    async fn play_fixture_audio(stream: &MusicStream) {
        use libmpv2::{events::{Event, EventContext}, Mpv};
        use std::time::Instant;

        assert_eq!(stream.url, "https://example.invalid/fixture.wav");
        assert!(stream.http_headers.is_empty());
        let path = std::env::temp_dir().join(format!("8spine-audio-{}.wav", uuid::Uuid::new_v4()));
        struct RemoveFixture(PathBuf);
        impl Drop for RemoveFixture {
            fn drop(&mut self) { let _ = std::fs::remove_file(&self.0); }
        }
        let _cleanup = RemoveFixture(path.clone());
        // Original, five-second mono tone: no third-party media or credentials.
        let mut writer = hound::WavWriter::create(&path, hound::WavSpec {
            channels: 1, sample_rate: 48000, bits_per_sample: 16,
            sample_format: hound::SampleFormat::Int,
        }).expect("create original tone");
        for i in 0..48000 * 5 {
            let phase = 2.0 * std::f64::consts::PI * 440.0 * f64::from(i) / 48000.0;
            writer.write_sample((8192.0 * phase.sin()) as i16).unwrap();
        }
        writer.finalize().unwrap();

        let mpv = Mpv::with_initializer(|init| {
            for (key, value) in [
                ("ao", "null"), ("vo", "null"), ("terminal", "no"),
                ("idle", "yes"), ("keep-open", "yes"), ("pause", "yes"),
            ] { init.set_property(key, value)?; }
            Ok(())
        }).expect("headless Harbor libmpv player");
        let mut events = EventContext::new(mpv.ctx);
        crate::mpv::mpv_argv_command(&mpv, &["loadfile", path.to_str().unwrap(), "replace"])
            .expect("load trusted local audio");
        let deadline = Instant::now() + Duration::from_secs(5);
        loop {
            if matches!(events.wait_event(0.0), Some(Ok(Event::FileLoaded))) { break; }
            assert!(Instant::now() < deadline, "8SPINE audio fixture failed to load");
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
        let duration = mpv.get_property::<f64>("duration").expect("decoded duration");
        assert!((duration - 5.0).abs() < 0.1);
        let sample_rate = mpv.get_property::<i64>("audio-params/samplerate").expect("decoded sample rate");
        assert_eq!(sample_rate, 48000);
        mpv.set_property("pause", false).expect("start decoding");
        let deadline = Instant::now() + Duration::from_secs(5);
        while mpv.get_property::<f64>("time-pos").unwrap_or(0.0) < 0.25 {
            assert!(Instant::now() < deadline, "8SPINE fixture playback did not advance");
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
        drop(events);
        drop(mpv);
    }
}
