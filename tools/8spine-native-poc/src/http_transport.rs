//! Host-only transport prototype. Do not expose grants, pins or this API to JS.
//! Host-owned bounded DNS resolution; no persisted consent store.
use reqwest::{Client, redirect::Policy};
use std::collections::BTreeSet;
use std::net::{IpAddr, Ipv4Addr, SocketAddr, ToSocketAddrs};
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, Instant};
use url::{Host, Url};

const MAX_REQUEST: usize = 4096;
const MAX_CALLS: usize = 8;
const MAX_BODY: usize = 32 * 1024;
const MAX_PINS: usize = 16;
const MAX_DNS_ANSWERS: usize = 64;
const DNS_TIME: Duration = Duration::from_secs(3);
// The OS resolver may continue in a blocking thread after an async timeout.
// Refuse additional lookups while that thread is still occupied.
static DNS_BUSY: AtomicBool = AtomicBool::new(false);

struct ResolverSlot;
impl Drop for ResolverSlot {
    fn drop(&mut self) { DNS_BUSY.store(false, Ordering::Release); }
}

fn select_public_ipv4(answers: impl IntoIterator<Item = SocketAddr>) -> Result<Vec<IpAddr>, &'static str> {
    let mut pins = BTreeSet::new();
    for (i, answer) in answers.into_iter().enumerate() {
        if i >= MAX_DNS_ANSWERS || answer.port() != 443 { return Err("address-denied"); }
        // IPv6 is deliberately not eligible for connection. An IPv4 answer
        // outside our public-address policy rejects the whole lookup.
        if let IpAddr::V4(ip) = answer.ip() {
            if !public_v4(ip) { return Err("address-denied"); }
            pins.insert(IpAddr::V4(ip));
            if pins.len() > MAX_PINS { return Err("address-denied"); }
        }
    }
    let pins: Vec<_> = pins.into_iter().collect();
    vetted_pins(&pins)?;
    Ok(pins)
}
const TOTAL_TIME: Duration = Duration::from_secs(10);
const REQUEST_TIME: Duration = Duration::from_secs(5);

/// Construct only in trusted host code after explicit module/version/host consent.
/// This value is deliberately not deserializable from worker arguments.
#[derive(Clone)]
pub struct NetworkGrant {
    module: String,
    version: String,
    hosts: BTreeSet<String>,
}

pub(crate) fn valid_dns_name(name: &str) -> bool {
    name.len() <= 253
        && name.contains('.')
        && name.split('.').all(|label| {
            !label.is_empty()
                && label.len() <= 63
                && !label.starts_with('-')
                && !label.ends_with('-')
                && label.bytes().all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-')
        })
        && name.rsplit('.').next().is_some_and(|s| s.bytes().any(|b| b.is_ascii_alphabetic()))
        && ![".local", ".localhost", ".internal", ".home.arpa", ".invalid", ".test"]
            .iter().any(|suffix| name.ends_with(suffix))
        && matches!(Url::parse(&format!("https://{name}/")).ok().and_then(|u| {
            if let Some(Host::Domain(host)) = u.host() { Some(host.to_owned()) } else { None }
        }).as_deref(), Some(host) if host == name)
}

impl NetworkGrant {
    pub fn new(module: &str, version: &str, hosts: &[&str]) -> Result<Self, &'static str> {
        if module.is_empty() || module.len() > 128 || version.is_empty() || version.len() > 128
            || hosts.is_empty() || hosts.len() > 16
            || hosts.iter().any(|h| !valid_dns_name(h))
        {
            return Err("invalid-grant");
        }
        Ok(Self {
            module: module.to_owned(),
            version: version.to_owned(),
            hosts: hosts.iter().map(|h| (*h).to_owned()).collect(),
        })
    }
}

/// A short-lived, per-invocation budget. A future supervisor must also support revocation.
pub struct NetworkSession {
    grant: NetworkGrant,
    deadline: Instant,
    calls: usize,
}

pub struct AuthorizedRequest {
    url: Url,
    host: String,
    deadline: Instant,
}

impl NetworkSession {
    pub fn new(grant: &NetworkGrant, module: &str, version: &str) -> Result<Self, &'static str> {
        if grant.module != module || grant.version != version {
            return Err("grant-scope");
        }
        Ok(Self { grant: grant.clone(), deadline: Instant::now() + TOTAL_TIME, calls: 0 })
    }

    /// Before DNS lookup, use only the host-owned permission list.
    pub fn authorize(&mut self, method: &str, raw: &str) -> Result<AuthorizedRequest, &'static str> {
        if Instant::now() >= self.deadline {
            return Err("deadline");
        }
        if self.calls >= MAX_CALLS {
            return Err("request-limit");
        }
        self.calls += 1;
        if method != "GET" {
            return Err("method-denied");
        }
        if raw.len() > MAX_REQUEST {
            return Err("request-size");
        }
        if !raw.starts_with("https://") || !raw.is_ascii()
            || raw.bytes().any(|b| b <= 32 || b == 127 || b == b'\\')
            || raw[8..].split(['/', '?', '#']).next().is_some_and(|authority| authority.contains('@'))
        {
            return Err("destination-denied");
        }
        let url = Url::parse(raw).map_err(|_| "invalid-url")?;
        let Some(Host::Domain(host)) = url.host() else { return Err("destination-denied"); };
        if url.scheme() != "https" || !self.grant.hosts.contains(host)
            || !url.username().is_empty() || url.password().is_some()
            || url.port().is_some() || url.fragment().is_some()
        {
            return Err("destination-denied");
        }
        let host = host.to_owned();
        Ok(AuthorizedRequest { url, host, deadline: self.deadline })
    }
}

// Conservative IPv4-only allowlist of globally routable address space.
// Reject all IPv6 until its special-purpose ranges and transition forms are audited.
fn public_v4(ip: Ipv4Addr) -> bool {
    let [a, b, c, _] = ip.octets();
    !(a == 0 || a == 10 || a == 127 || a >= 224
        || (a == 100 && (64..=127).contains(&b))
        || (a == 169 && b == 254)
        || (a == 172 && (16..=31).contains(&b))
        || (a == 192 && (b == 168 || (b == 0 && (c == 0 || c == 2)) || (b == 88 && c == 99)))
        || (a == 198 && (b == 18 || b == 19 || (b == 51 && c == 100)))
        || (a == 203 && b == 0 && c == 113))
}

fn vetted_pins(ips: &[IpAddr]) -> Result<Vec<SocketAddr>, &'static str> {
    if ips.is_empty() || ips.len() > MAX_PINS
        || ips.iter().any(|ip| !matches!(ip, IpAddr::V4(v4) if public_v4(*v4)))
    {
        return Err("address-denied");
    }
    Ok(ips.iter().map(|ip| SocketAddr::new(*ip, 443)).collect())
}

#[derive(Debug, PartialEq, Eq)]
pub struct HttpReply {
    pub status: u16,
    pub body: String,
}

fn append_bounded(body: &mut Vec<u8>, chunk: &[u8], limit: usize) -> Result<(), &'static str> {
    if chunk.len() > limit.saturating_sub(body.len()) {
        return Err("response-size");
    }
    body.extend_from_slice(chunk);
    Ok(())
}

fn check_status(status: u16) -> Result<(), &'static str> {
    if (300..400).contains(&status) {
        return Err("redirect-denied");
    }
    Ok(())
}

impl AuthorizedRequest {
    /// The trusted supervisor must resolve this name with a bounded resolver.
    pub fn hostname(&self) -> &str {
        &self.host
    }

    fn client(&self, resolved_host: &str, ips: &[IpAddr]) -> Result<Client, &'static str> {
        let remaining = self.deadline.checked_duration_since(Instant::now()).ok_or("deadline")?;
        if remaining.is_zero() { return Err("deadline"); }
        if resolved_host != self.host { return Err("address-denied"); }
        let pins = vetted_pins(ips)?;
        // Fresh client, no proxy/redirect/referer/cookies, no automatic decompression.
        // Preserve the original hostname for SNI and certificate validation.
        Client::builder()
            .https_only(true)
            .no_proxy()
            .redirect(Policy::none())
            .referer(false)
            .no_gzip()
            .no_brotli()
            .no_deflate()
            .no_zstd()
            .resolve_to_addrs(&self.host, &pins)
            .timeout(remaining.min(REQUEST_TIME))
            .connect_timeout(remaining.min(Duration::from_secs(3)))
            .build()
            .map_err(|_| "transport-init")
    }

    /// Resolve only the already-authorized hostname, and connect only to the
    /// returned vetted IPv4 pins. No module chooses a resolver or an address.
    pub(crate) async fn send_resolved_bytes(self, limit: usize) -> Result<(u16, Vec<u8>), &'static str> {
        let remaining = self.deadline.checked_duration_since(Instant::now()).ok_or("deadline")?;
        if remaining.is_zero() { return Err("deadline"); }
        if DNS_BUSY.compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire).is_err() {
            return Err("resolver-busy");
        }
        let slot = ResolverSlot;
        let host = self.host.clone();
        let lookup_host = host.clone();
        // A trailing dot requests an absolute DNS name rather than applying
        // local suffix search. TLS still uses the original authorized hostname.
        let lookup = tokio::task::spawn_blocking(move || {
            let _slot = slot;
            let absolute = format!("{lookup_host}.");
            let answers = (absolute.as_str(), 443).to_socket_addrs().map_err(|_| "dns-failed")?;
            select_public_ipv4(answers)
        });
        let pins = tokio::time::timeout(remaining.min(DNS_TIME), lookup).await
            .map_err(|_| "dns-timeout")?.map_err(|_| "dns-failed")??;
        self.send_bounded_bytes(&host, &pins, limit).await
    }

    /// Consume the capability once. DNS answers must come from the trusted host,
    /// never the module. No invocation from QuickJS or worker stdin exists yet.
    pub async fn send(self, resolved_host: &str, ips: &[IpAddr]) -> Result<HttpReply, &'static str> {
        let (status, body) = self.send_bounded_bytes(resolved_host, ips, MAX_BODY).await?;
        Ok(HttpReply { status, body: String::from_utf8(body).map_err(|_| "invalid-utf8")? })
    }

    // Host repository ingestion needs opaque bytes and a larger, independently
    // bounded response. Never expose this variant to a module or fetch shim.
    pub(crate) async fn send_bounded_bytes(self, resolved_host: &str, ips: &[IpAddr],
        limit: usize) -> Result<(u16, Vec<u8>), &'static str> {
        if limit == 0 || limit > 2 * 1024 * 1024 { return Err("response-size"); }
        let client = self.client(resolved_host, ips)?;
        let mut response = client.get(self.url)
            .header(reqwest::header::ACCEPT, "application/json, text/plain, application/octet-stream")
            .header(reqwest::header::ACCEPT_ENCODING, "identity")
            .send().await.map_err(|_| "network-failed")?;
        let status = response.status().as_u16();
        check_status(status)?;
        if response.content_length().is_some_and(|n| n > limit as u64) {
            return Err("response-size");
        }
        let mut body = Vec::new();
        while let Some(chunk) = response.chunk().await.map_err(|_| "network-failed")? {
            append_bounded(&mut body, &chunk, limit)?;
        }
        Ok((status, body))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn grant() -> NetworkGrant {
        NetworkGrant::new("fixture-module", "1", &["catalog.example.com"]).unwrap()
    }

    #[test]
    fn grants_are_exact_and_version_scoped() {
        for name in ["*", "*.example.com", "127.0.0.1", "localhost", "a.local", "a.home.arpa",
            "a.example.com.", "a.example.com/path", "http://a.example.com"] {
            assert!(NetworkGrant::new("fixture-module", "1", &[name]).is_err(), "{name}");
        }
        let grant = grant();
        assert!(NetworkSession::new(&grant, "other", "1").is_err());
        assert!(NetworkSession::new(&grant, "fixture-module", "2").is_err());
        let mut session = NetworkSession::new(&grant, "fixture-module", "1").unwrap();
        assert_eq!(session.authorize("GET", "https://catalog.example.com/search").unwrap().hostname(), "catalog.example.com");
    }

    #[test]
    fn deny_unapproved_targets_and_count_denials() {
        let grant = grant();
        let bad = [
            "http://catalog.example.com/search",
            "https://catalog.example.com.evil.example/search",
            "https://127.0.0.1/search",
            "https://[::1]/search",
            "https://catalog.example.com:444/search",
            "https://@catalog.example.com/search",
            "https://catalog.example.com/search#private",
            "https://catalog.example.com\\@evil.example/search",
        ];
        let mut session = NetworkSession::new(&grant, "fixture-module", "1").unwrap();
        for url in bad {
            assert!(session.authorize("GET", url).is_err(), "{url}");
        }
        assert_eq!(session.authorize("GET", "https://catalog.example.com/").err(), Some("request-limit"));
        let mut session = NetworkSession::new(&grant, "fixture-module", "1").unwrap();
        assert_eq!(session.authorize("POST", "https://catalog.example.com/").err(), Some("method-denied"));
        assert_eq!(session.authorize("GET", &format!("https://catalog.example.com/{}", "x".repeat(4096))).err(), Some("request-size"));
    }

    #[test]
    fn pins_reject_private_special_and_mixed_answers() {
        for address in ["0.0.0.0", "10.0.0.1", "100.64.0.1", "127.0.0.1", "169.254.169.254",
            "172.16.0.1", "192.0.0.1", "192.0.2.1", "192.88.99.1", "192.168.1.1",
            "198.18.0.1", "198.51.100.1", "203.0.113.1", "224.0.0.1", "255.255.255.255",
            "::1", "::ffff:127.0.0.1", "fc00::1", "fe80::1", "2606:4700::1111"] {
            let ip: IpAddr = address.parse().unwrap();
            assert_eq!(vetted_pins(&[ip]), Err("address-denied"), "{address}");
            assert_eq!(vetted_pins(&["8.8.8.8".parse().unwrap(), ip]), Err("address-denied"));
        }
        assert_eq!(vetted_pins(&[]), Err("address-denied"));
        assert_eq!(vetted_pins(&["8.8.8.8".parse().unwrap()]).unwrap()[0].port(), 443);
    }

    #[test]
    fn resolver_selects_only_bounded_public_ipv4() {
        let public: SocketAddr = "8.8.8.8:443".parse().unwrap();
        let private: SocketAddr = "127.0.0.1:443".parse().unwrap();
        let ipv6: SocketAddr = "[2606:4700::1111]:443".parse().unwrap();
        let mapped: SocketAddr = "[::ffff:127.0.0.1]:443".parse().unwrap();
        assert_eq!(select_public_ipv4([public, ipv6, mapped, public]), Ok(vec![public.ip()]));
        assert_eq!(select_public_ipv4([public, private]), Err("address-denied"));
        assert_eq!(select_public_ipv4([ipv6]), Err("address-denied"));
        assert_eq!(select_public_ipv4([public; MAX_DNS_ANSWERS + 1]), Err("address-denied"));
        assert_eq!(select_public_ipv4(["8.8.8.8:80".parse().unwrap()]), Err("address-denied"));
    }

    #[test]
    fn response_bounds_and_redirects() {
        let mut body = Vec::new();
        append_bounded(&mut body, &vec![b'a'; MAX_BODY], MAX_BODY).unwrap();
        assert_eq!(append_bounded(&mut body, b"x", MAX_BODY), Err("response-size"));
        assert_eq!(body.len(), MAX_BODY);
        assert_eq!(check_status(302), Err("redirect-denied"));
        assert_eq!(check_status(404), Ok(()));
    }

    #[tokio::test]
    async fn transport_constructs_offline_with_only_vetted_pins() {
        let grant = grant();
        let mut session = NetworkSession::new(&grant, "fixture-module", "1").unwrap();
        let request = session.authorize("GET", "https://catalog.example.com/search").unwrap();
        let pins = ["8.8.8.8".parse().unwrap()];
        assert!(request.client("other.example.com", &pins).is_err());
        assert!(request.client("catalog.example.com", &["127.0.0.1".parse().unwrap()]).is_err());
        assert!(request.client("catalog.example.com", &pins).is_ok());
        // No socket is opened: test the same send entry point with denied pins.
        assert_eq!(request.send("catalog.example.com", &["127.0.0.1".parse().unwrap()]).await, Err("address-denied"));
    }
}
