//! Simulated, host-owned HTTP policy. No socket, DNS, HTTP client or user credentials.
use serde_json::{json, Value};
use std::cell::Cell;
use std::time::Instant;
use url::Url;

const MAX_REQUEST: usize = 4096;
const MAX_CALLS: usize = 8;
const MAX_BODY: usize = 32 * 1024;
const HOST: &str = "catalog.example.invalid";

pub(crate) struct Broker {
    deadline: Instant,
}

impl Broker {
    pub fn new(deadline: Instant) -> Self {
        Self { deadline }
    }

    pub fn request(&self, calls: &Cell<usize>, payload: &str) -> String {
        match self.run(calls, payload) {
            Ok(value) => json!({"ok": true, "response": value}).to_string(),
            Err(code) => json!({"ok": false, "error": code}).to_string(),
        }
    }

    fn run(&self, calls: &Cell<usize>, payload: &str) -> Result<Value, &'static str> {
        if Instant::now() >= self.deadline {
            return Err("deadline");
        }
        if calls.get() >= MAX_CALLS {
            return Err("request-limit");
        }
        calls.set(calls.get() + 1);
        if payload.len() > MAX_REQUEST {
            return Err("request-size");
        }
        let request: Value = serde_json::from_str(payload).map_err(|_| "invalid-request")?;
        let fields = request.as_object().ok_or("invalid-request")?;
        if fields.len() != 2 || !fields.contains_key("url") || !fields.contains_key("method") {
            return Err("invalid-request");
        }
        if request["method"] != "GET" {
            return Err("method-denied");
        }
        let raw = request["url"].as_str().ok_or("invalid-url")?;
        if !raw.is_ascii() || raw.bytes().any(|b| b <= 32 || b == 127 || b == b'\\') {
            return Err("invalid-url");
        }
        let url = Url::parse(raw).map_err(|_| "invalid-url")?;
        // Exact approved hostname, HTTPS default port, no userinfo/fragment.
        if url.scheme() != "https"
            || url.host_str() != Some(HOST)
            || !url.username().is_empty()
            || url.password().is_some()
            || url.port().is_some()
            || url.fragment().is_some()
        {
            return Err("destination-denied");
        }
        // This is a deterministic fixture transport, not a network implementation.
        let (status, body) = match url.path() {
            "/catalog" => (200, json!({
                "tracks": [{"id": 42, "title": "Original test tone", "artist": "Fixture", "duration": 5}]
            }).to_string()),
            "/resolve" => (200, json!({"streamUrl": "https://example.invalid/fixture.wav"}).to_string()),
            "/missing" => (404, "{}".to_owned()),
            "/redirect" => (302, String::new()),
            "/oversized" => (200, "x".repeat(MAX_BODY + 1)),
            _ => return Err("route-denied"),
        };
        if (300..400).contains(&status) {
            return Err("redirect-denied");
        }
        if body.len() > MAX_BODY {
            return Err("response-size");
        }
        Ok(json!({"status": status, "body": body}))
    }
}
