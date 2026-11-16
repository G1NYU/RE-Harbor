//! Host-owned request handling for a future isolated worker IPC bridge.
//! No worker is wired to this API yet. Only bounded text GET responses.
use super::{ModuleManager, ModulePermit};
use crate::http_transport::{AuthorizedRequest, HttpReply, NetworkSession};
use serde::Deserialize;

const MAX_FRAME: usize = 4096;
const MAX_CALLS: usize = 8;
const MAX_BODY: usize = 32 * 1024;

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct RequestFrame {
    method: String,
    url: String,
}

pub struct ModuleNetworkBroker<'p> {
    permit: &'p ModulePermit,
    session: NetworkSession,
    calls: usize,
}

impl<'p> ModuleNetworkBroker<'p> {
    pub fn new(manager: &ModuleManager, permit: &'p ModulePermit) -> Result<Self, &'static str> {
        let grant = manager.network_grant(permit)?;
        let session = NetworkSession::new(&grant, &permit.key.id, &permit.fingerprint)?;
        Ok(Self { permit, session, calls: 0 })
    }

    fn authorize(&mut self, manager: &ModuleManager, frame: &[u8]) -> Result<AuthorizedRequest, &'static str> {
        manager.network_grant(self.permit)?;
        if self.calls >= MAX_CALLS { return Err("request-limit"); }
        self.calls += 1;
        if frame.len() > MAX_FRAME { return Err("request-size"); }
        let frame: RequestFrame = serde_json::from_slice(frame).map_err(|_| "invalid-request")?;
        self.session.authorize(&frame.method, &frame.url)
    }

    /// The host owns DNS and TLS. No headers, credentials or pins from the
    /// worker. The immutable borrow defers manager mutation during this call;
    /// production supervision must additionally cancel in-flight requests.
    pub async fn request(&mut self, manager: &ModuleManager, frame: &[u8]) -> Result<HttpReply, &'static str> {
        let authorized = self.authorize(manager, frame)?;
        let (status, bytes) = authorized.send_resolved_bytes(MAX_BODY).await?;
        manager.network_grant(self.permit)?;
        let body = String::from_utf8(bytes).map_err(|_| "invalid-utf8")?;
        Ok(HttpReply { status, body })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::module_manager::{parse_catalog, CatalogEntry};

    const SOURCE: &[u8] = b"return {};";
    const GET: &[u8] = br#"{"method":"GET","url":"https://api.example.com/catalog"}"#;

    fn setup() -> (ModuleManager, CatalogEntry, ModulePermit) {
        let index = br#"{"category:modules":[{"id":"fixture","type":"MODULE","name":"Fixture","version":"1","download":"https://files.example.com/fixture.js"}]}"#;
        let entry = parse_catalog("https://modules.example.com/index.json", index).unwrap().pop().unwrap();
        let mut manager = ModuleManager::default();
        manager.stage(&entry, SOURCE).unwrap();
        let sha = manager.get(&entry.key).unwrap().fingerprint().to_owned();
        manager.approve(&entry.key, &sha, &["api.example.com"]).unwrap();
        let permit = manager.permit(&entry.key, SOURCE).unwrap();
        (manager, entry, permit)
    }

    #[test]
    fn only_exact_host_get_and_strict_frames_are_accepted() {
        let (manager, _, permit) = setup();
        let mut broker = ModuleNetworkBroker::new(&manager, &permit).unwrap();
        assert_eq!(broker.authorize(&manager, GET).unwrap().hostname(), "api.example.com");
        for (frame, error) in [
            (br#"{"method":"POST","url":"https://api.example.com/"}"#.as_slice(), "method-denied"),
            (br#"{"method":"GET","url":"https://api.example.com.evil.com/"}"#.as_slice(), "destination-denied"),
            (br#"{"method":"GET","url":"https://127.0.0.1/"}"#.as_slice(), "destination-denied"),
            (br#"{"method":"GET","url":"https://api.example.com/","headers":{}}"#.as_slice(), "invalid-request"),
            (br#"{"method":"GET","method":"GET","url":"https://api.example.com/"}"#.as_slice(), "invalid-request"),
        ] {
            assert_eq!(broker.authorize(&manager, frame).err(), Some(error));
        }
        assert_eq!(broker.authorize(&manager, &vec![b'x'; MAX_FRAME + 1]).err(), Some("request-size"));
    }

    #[test]
    fn malformed_requests_consume_budget_and_revocation_invalidates_session() {
        let (mut manager, entry, permit) = setup();
        let mut broker = ModuleNetworkBroker::new(&manager, &permit).unwrap();
        for _ in 0..MAX_CALLS {
            assert_eq!(broker.authorize(&manager, b"{}").err(), Some("invalid-request"));
        }
        assert_eq!(broker.authorize(&manager, GET).err(), Some("request-limit"));
        let other = ModuleManager::default();
        assert_eq!(broker.authorize(&other, GET).err(), Some("revoked"));
        manager.disable(&entry.key).unwrap();
        assert_eq!(broker.authorize(&manager, GET).err(), Some("revoked"));
    }

    #[tokio::test]
    async fn denied_destination_never_reaches_network() {
        let (manager, _, permit) = setup();
        let mut broker = ModuleNetworkBroker::new(&manager, &permit).unwrap();
        let frame = br#"{"method":"GET","url":"https://169.254.169.254/"}"#;
        assert_eq!(broker.request(&manager, frame).await.err(), Some("destination-denied"));
    }
}
