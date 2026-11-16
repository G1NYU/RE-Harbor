//! Development supervisor. Only the trusted compiled-in fixture protocol is accepted.
//! A separate Linux experiment requires real namespace isolation; there is no fallback.
use serde_json::{json, Value};
use crate::module_manager::{ModuleManager, ModulePermit};

fn approved_fixture_input(manager: &ModuleManager, permit: &ModulePermit,
    bytes: &[u8], operation: &Value) -> Result<Value, &'static str> {
    let source = manager.approved_source_body(permit, bytes)?;
    if source != crate::IMPORTED_FIXTURE { return Err("fixture-source-denied"); }
    let mut request = operation.as_object().ok_or("invalid-request")?.clone();
    if request.contains_key("fixture") || request.contains_key("source") {
        return Err("invalid-request");
    }
    request.insert("fixture".to_owned(), json!("imported-fixture"));
    request.insert("source".to_owned(), json!(source));
    let request = Value::Object(request);
    crate::validated_request(&serde_json::to_vec(&request).map_err(|_| "invalid-request")?)?;
    Ok(request)
}
use std::{path::{Path, PathBuf}, process::Stdio, time::Duration};
use tokio::{io::{AsyncReadExt, AsyncWriteExt}, process::Command};

const MAX_REPLY: usize = 256 * 1024 + 1024;
const MAX_WALL: Duration = Duration::from_secs(5);

#[derive(Debug, Clone, Copy)]
pub enum Isolation {
    /// For compiled fixtures only. Not a sandbox.
    TrustedFixture,
    /// An opt-in Linux namespace experiment. Unsupported elsewhere.
    LinuxNamespace,
}

pub struct Supervisor {
    worker: PathBuf,
    wall: Duration,
    isolation: Isolation,
}

impl Supervisor {
    /// The worker path must be supplied by the trusted host, never by a module.
    pub fn new(worker: &Path, wall: Duration, isolation: Isolation) -> Result<Self, &'static str> {
        if !worker.is_absolute() || wall.is_zero() || wall > MAX_WALL {
            return Err("invalid-supervisor");
        }
        let worker = worker.canonicalize().map_err(|_| "worker-unavailable")?;
        if !worker.is_file() { return Err("worker-unavailable"); }
        if matches!(isolation, Isolation::LinuxNamespace) && !cfg!(target_os = "linux") {
            return Err("sandbox-unavailable");
        }
        Ok(Self { worker, wall, isolation })
    }

    fn command(&self) -> Result<Command, &'static str> {
        let mut command = match self.isolation {
            Isolation::TrustedFixture => Command::new(&self.worker),
            Isolation::LinuxNamespace => {
                #[cfg(target_os = "linux")]
                {
                    let launcher = Path::new("/usr/bin/bwrap");
                    if !launcher.is_file() { return Err("sandbox-unavailable"); }
                    let mut c = Command::new(launcher);
                    c.args(["--unshare-user", "--unshare-pid", "--unshare-net",
                        "--unshare-ipc", "--unshare-uts", "--disable-userns",
                        "--die-with-parent", "--new-session", "--cap-drop", "ALL",
                        "--clearenv", "--dev", "/dev", "--size", "16777216",
                        "--tmpfs", "/tmp", "--chdir", "/tmp"]);
                    // Only the runtime libraries and the trusted worker are mounted.
                    // Read-only library exposure is for this experiment, not a
                    // general distribution policy for arbitrary Linux installations.
                    for dir in ["/lib", "/lib64", "/usr/lib", "/usr/lib64"] {
                        if Path::new(dir).is_dir() { c.args(["--ro-bind", dir, dir]); }
                    }
                    c.arg("--ro-bind").arg(&self.worker).arg("/worker");
                    c.args(["--", "/worker"]);
                    c
                }
                #[cfg(not(target_os = "linux"))]
                { return Err("sandbox-unavailable"); }
            }
        };
        command.env_clear()
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .kill_on_drop(true);
        #[cfg(windows)]
        if let Some(root) = std::env::var_os("SystemRoot") {
            command.env("SystemRoot", root);
        }
        Ok(command)
    }

    async fn exchange(&self, args: &[&std::ffi::OsStr], input: &[u8]) -> Result<Value, &'static str> {
        if input.len() > crate::MAX_INPUT { return Err("input-limit"); }
        let private = tempfile::tempdir().map_err(|_| "worker-directory")?;
        let mut cmd = self.command()?;
        cmd.current_dir(private.path()).args(args);
        exchange_command(cmd, input, self.wall).await
    }

    pub async fn run_fixture(&self, request: &Value) -> Result<Value, &'static str> {
        let input = serde_json::to_vec(request).map_err(|_| "invalid-request")?;
        crate::validated_request(&input)?;
        if matches!(request["fixture"].as_str(), Some("imported-fixture" | "host-broker")) { return Err("fixture-consent-required"); }
        self.exchange(&[], &input).await
    }

    /// End-to-end consent and source transport test. Isolation is mandatory.
    /// Only the exact locally authored fixture can reach the engine.
    pub async fn run_approved_fixture(&self, manager: &ModuleManager, permit: &ModulePermit,
        bytes: &[u8], operation: &Value) -> Result<Value, &'static str> {
        if !matches!(self.isolation, Isolation::LinuxNamespace) {
            return Err("sandbox-unavailable");
        }
        let request = approved_fixture_input(manager, permit, bytes, operation)?;
        let input = serde_json::to_vec(&request).map_err(|_| "invalid-request")?;
        self.exchange(&[], &input).await
    }

    /// Fixed compiled-in network fixture only; no third-party source execution.
    #[cfg(target_os = "linux")]
    pub async fn run_host_broker_fixture(&self, manager: &ModuleManager, permit: &ModulePermit,
        bytes: &[u8]) -> Result<Value, &'static str> {
        if !matches!(self.isolation, Isolation::LinuxNamespace) {
            return Err("sandbox-unavailable");
        }
        if manager.approved_source_body(permit, bytes)? != crate::host_bridge::SOURCE {
            return Err("fixture-source-denied");
        }
        let private = tempfile::tempdir().map_err(|_| "worker-directory")?;
        let mut cmd = self.command()?;
        cmd.current_dir(private.path()).arg("--host-broker-fixture");
        crate::host_bridge::exchange(cmd, manager, permit).await
    }

    /// Experimental search through actual namespace isolation only.
    #[cfg(target_os = "linux")]
    pub async fn run_approved_search(&self, manager: &ModuleManager, permit: &ModulePermit,
        bytes: &[u8], query: &str, limit: usize) -> Result<Value, &'static str> {
        if !matches!(self.isolation, Isolation::LinuxNamespace) { return Err("sandbox-unavailable"); }
        let input = crate::host_bridge::approved_search_input(manager, permit, bytes, query, limit)?;
        let private = tempfile::tempdir().map_err(|_| "worker-directory")?;
        let mut cmd = self.command()?;
        cmd.current_dir(private.path()).arg("--approved-search");
        crate::host_bridge::exchange_approved_search(cmd, manager, permit, input).await
    }

    #[cfg(target_os = "linux")]
    pub async fn run_configured(&self, manager: &ModuleManager, permit: &ModulePermit,
        bytes: &[u8], operation: Value, settings: &Value) -> Result<Value, &'static str> {
        if !matches!(self.isolation, Isolation::LinuxNamespace) { return Err("sandbox-unavailable"); }
        let input = crate::host_bridge::configured_input(manager, permit, bytes, operation, settings)?;
        let private = tempfile::tempdir().map_err(|_| "worker-directory")?;
        let mut cmd = self.command()?;
        cmd.current_dir(private.path()).arg("--approved-search");
        crate::host_bridge::exchange_approved_search(cmd, manager, permit, input).await
    }

    #[cfg(target_os = "linux")]
    pub async fn run_approved_resolve(&self, manager: &ModuleManager, permit: &ModulePermit,
        bytes: &[u8], track_id: &Value, quality: &str) -> Result<Value, &'static str> {
        if !matches!(self.isolation, Isolation::LinuxNamespace) { return Err("sandbox-unavailable"); }
        let input = crate::host_bridge::approved_resolve_input(manager, permit, bytes, track_id, quality)?;
        let private = tempfile::tempdir().map_err(|_| "worker-directory")?;
        let mut cmd = self.command()?;
        cmd.current_dir(private.path()).arg("--approved-search");
        crate::host_bridge::exchange_approved_search(cmd, manager, permit, input).await
    }

    /// Host diagnostic: checks a synthetic sentinel and loopback listener.
    /// No arbitrary-source execution path is introduced.
    #[cfg(target_os = "linux")]
    pub async fn isolation_probe(&self, sentinel: &Path, addr: std::net::SocketAddr) -> Result<Value, &'static str> {
        if !matches!(self.isolation, Isolation::LinuxNamespace)
            || !sentinel.is_absolute() || !addr.ip().is_loopback()
        { return Err("invalid-probe"); }
        let address = addr.to_string();
        self.exchange(&[std::ffi::OsStr::new("--isolation-probe"), sentinel.as_os_str(),
            std::ffi::OsStr::new(&address)], b"").await
    }
}

// The external launcher is trusted host infrastructure, never a module.
// Its own five-second worker deadline and kill-on-close job are independent
// of this outer deadline. This API is not registered with production Harbor.
#[cfg(windows)]
pub struct WindowsFixtureSupervisor {
    worker: PathBuf,
    launcher: PathBuf,
}

#[cfg(windows)]
impl WindowsFixtureSupervisor {
    pub fn new(worker: &Path, launcher: &Path) -> Result<Self, &'static str> {
        fn trusted_file(path: &Path) -> Result<PathBuf, &'static str> {
            if !path.is_absolute() { return Err("invalid-supervisor"); }
            let canonical = path.canonicalize().map_err(|_| "sandbox-unavailable")?;
            if !canonical.is_file() { return Err("sandbox-unavailable"); }
            Ok(canonical)
        }
        Ok(Self { worker: trusted_file(worker)?, launcher: trusted_file(launcher)? })
    }

    pub async fn run_fixture(&self, request: &Value) -> Result<Value, &'static str> {
        if matches!(request["fixture"].as_str(), Some("imported-fixture" | "host-broker")) { return Err("fixture-consent-required"); }
        self.run_request(request).await
    }

    pub async fn run_approved_fixture(&self, manager: &ModuleManager, permit: &ModulePermit,
        bytes: &[u8], operation: &Value) -> Result<Value, &'static str> {
        let request = approved_fixture_input(manager, permit, bytes, operation)?;
        self.run_request(&request).await
    }

    /// Fixed, compiled-in network fixture. The trusted launcher passes only
    /// the host's two protocol pipe handles to the zero-capability child.
    pub async fn run_host_broker_fixture(&self, manager: &ModuleManager, permit: &ModulePermit,
        bytes: &[u8]) -> Result<Value, &'static str> {
        if manager.approved_source_body(permit, bytes)? != crate::host_bridge::SOURCE {
            return Err("fixture-source-denied");
        }
        let private = tempfile::tempdir().map_err(|_| "worker-directory")?;
        let copy = private.path().join("harbor-8spine-native-poc.exe");
        std::fs::copy(&self.worker, &copy).map_err(|_| "worker-copy")?;
        let mut cmd = Command::new(&self.launcher);
        cmd.arg("--host-broker-fixture").arg(&copy)
            .current_dir(private.path()).env_clear()
            .stdin(Stdio::piped()).stdout(Stdio::piped())
            .stderr(Stdio::null()).kill_on_drop(true);
        for key in ["SystemRoot", "LOCALAPPDATA", "USERPROFILE"] {
            let value = std::env::var_os(key).ok_or("sandbox-unavailable")?;
            if !Path::new(&value).is_absolute() { return Err("sandbox-unavailable"); }
            cmd.env(key, value);
        }
        crate::host_bridge::exchange(cmd, manager, permit).await
    }

    /// Experimental search through the same zero-capability AppContainer and
    /// framed IPC as the validated host broker fixture.
    pub async fn run_approved_search(&self, manager: &ModuleManager, permit: &ModulePermit,
        bytes: &[u8], query: &str, limit: usize) -> Result<Value, &'static str> {
        let input = crate::host_bridge::approved_search_input(manager, permit, bytes, query, limit)?;
        let private = tempfile::tempdir().map_err(|_| "worker-directory")?;
        let copy = private.path().join("harbor-8spine-native-poc.exe");
        std::fs::copy(&self.worker, &copy).map_err(|_| "worker-copy")?;
        let mut cmd = Command::new(&self.launcher);
        cmd.arg("--approved-search").arg(&copy)
            .current_dir(private.path()).env_clear()
            .stdin(Stdio::piped()).stdout(Stdio::piped())
            .stderr(Stdio::null()).kill_on_drop(true);
        for key in ["SystemRoot", "LOCALAPPDATA", "USERPROFILE"] {
            let value = std::env::var_os(key).ok_or("sandbox-unavailable")?;
            if !Path::new(&value).is_absolute() { return Err("sandbox-unavailable"); }
            cmd.env(key, value);
        }
        crate::host_bridge::exchange_approved_search(cmd, manager, permit, input).await
    }

    pub async fn run_configured(&self, manager: &ModuleManager, permit: &ModulePermit,
        bytes: &[u8], operation: Value, settings: &Value) -> Result<Value, &'static str> {
        let input = crate::host_bridge::configured_input(manager, permit, bytes, operation, settings)?;
        let private = tempfile::tempdir().map_err(|_| "worker-directory")?;
        let copy = private.path().join("harbor-8spine-native-poc.exe");
        std::fs::copy(&self.worker, &copy).map_err(|_| "worker-copy")?;
        let mut cmd = Command::new(&self.launcher);
        cmd.arg("--approved-search").arg(&copy)
            .current_dir(private.path()).env_clear()
            .stdin(Stdio::piped()).stdout(Stdio::piped())
            .stderr(Stdio::null()).kill_on_drop(true);
        for key in ["SystemRoot", "LOCALAPPDATA", "USERPROFILE"] {
            let value = std::env::var_os(key).ok_or("sandbox-unavailable")?;
            if !Path::new(&value).is_absolute() { return Err("sandbox-unavailable"); }
            cmd.env(key, value);
        }
        crate::host_bridge::exchange_approved_search(cmd, manager, permit, input).await
    }

    pub async fn run_approved_resolve(&self, manager: &ModuleManager, permit: &ModulePermit,
        bytes: &[u8], track_id: &Value, quality: &str) -> Result<Value, &'static str> {
        let input = crate::host_bridge::approved_resolve_input(manager, permit, bytes, track_id, quality)?;
        let private = tempfile::tempdir().map_err(|_| "worker-directory")?;
        let copy = private.path().join("harbor-8spine-native-poc.exe");
        std::fs::copy(&self.worker, &copy).map_err(|_| "worker-copy")?;
        let mut cmd = Command::new(&self.launcher);
        cmd.arg("--approved-search").arg(&copy)
            .current_dir(private.path()).env_clear()
            .stdin(Stdio::piped()).stdout(Stdio::piped())
            .stderr(Stdio::null()).kill_on_drop(true);
        for key in ["SystemRoot", "LOCALAPPDATA", "USERPROFILE"] {
            let value = std::env::var_os(key).ok_or("sandbox-unavailable")?;
            if !Path::new(&value).is_absolute() { return Err("sandbox-unavailable"); }
            cmd.env(key, value);
        }
        crate::host_bridge::exchange_approved_search(cmd, manager, permit, input).await
    }

    async fn run_request(&self, request: &Value) -> Result<Value, &'static str> {
        let input = serde_json::to_vec(request).map_err(|_| "invalid-request")?;
        // Deliberately match the smaller Windows harness input cap.
        if input.len() > 1024 { return Err("input-limit"); }
        crate::validated_request(&input)?;
        // Copy the trusted build into a disposable directory: the launcher
        // attaches a fresh profile-specific ACL only to this copy and folder.
        let private = tempfile::tempdir().map_err(|_| "worker-directory")?;
        let copy = private.path().join("harbor-8spine-native-poc.exe");
        std::fs::copy(&self.worker, &copy).map_err(|_| "worker-copy")?;
        let mut cmd = Command::new(&self.launcher);
        cmd.arg("--fixture-request").arg(&copy)
            .current_dir(private.path()).env_clear()
            .stdin(Stdio::piped()).stdout(Stdio::piped())
            .stderr(Stdio::null()).kill_on_drop(true);
        // Required host profile-resolution inputs for the trusted launcher.
        // No PATH, credentials or other inherited runner environment.
        for key in ["SystemRoot", "LOCALAPPDATA", "USERPROFILE"] {
            let value = std::env::var_os(key).ok_or("sandbox-unavailable")?;
            if !Path::new(&value).is_absolute() { return Err("sandbox-unavailable"); }
            cmd.env(key, value);
        }
        exchange_command(cmd, &input, Duration::from_secs(15)).await
    }
}

async fn exchange_command(mut cmd: Command, input: &[u8], wall: Duration) -> Result<Value, &'static str> {
    let mut child = cmd.spawn().map_err(|_| "worker-spawn")?;
    let mut stdin = child.stdin.take().ok_or("worker-stdin")?;
    let stdout = child.stdout.take().ok_or("worker-stdout")?;
    let mut out = Vec::new();
    let result = tokio::time::timeout(wall, async {
        // Drain and write concurrently: a compromised process must not deadlock
        // the parent with full IPC buffers, and the output is strictly bounded.
        let write = async {
            stdin.write_all(input).await.map_err(|_| "worker-input")?;
            drop(stdin);
            Ok::<(), &'static str>(())
        };
        let read = async {
            stdout.take((MAX_REPLY + 1) as u64).read_to_end(&mut out)
                .await.map_err(|_| "worker-output")?;
            if out.len() > MAX_REPLY { return Err("worker-output-limit"); }
            Ok::<(), &'static str>(())
        };
        tokio::try_join!(write, read)?;
        if !child.wait().await.map_err(|_| "worker-wait")?.success() {
            return Err("worker-exit");
        }
        Ok::<(), &'static str>(())
    }).await;
    match result {
        Ok(Ok(())) => check_reply(&out),
        other => {
            // kill_on_drop also covers task cancellation. Explicitly stop and
            // reap the worker on a transport failure or wall timeout.
            let _ = child.start_kill();
            let _ = tokio::time::timeout(Duration::from_secs(1), child.wait()).await;
            match other {
                Ok(Err(error)) => Err(error),
                Err(_) => Err("worker-timeout"),
                Ok(Ok(())) => unreachable!(),
            }
        }
    }

}

fn check_reply(bytes: &[u8]) -> Result<Value, &'static str> {
    if bytes.len() > MAX_REPLY { return Err("worker-output-limit"); }
    let value: Value = serde_json::from_slice(bytes).map_err(|_| "worker-protocol")?;
    let obj = value.as_object().ok_or("worker-protocol")?;
    if obj.len() != 2 { return Err("worker-protocol"); }
    match value["ok"].as_bool() {
        Some(true) if obj.contains_key("result") => Ok(value),
        Some(false) if value["error"].as_str().is_some_and(|s| matches!(s,
            "invalid-request" | "input-limit" | "input-error" | "runtime-init" |
            "execution-timeout" | "unsettled-result" | "fixture-failed" |
            "output-limit" | "invalid-output" | "fixture-url-rejected")) => Ok(value),
        _ => Err("worker-protocol"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn reply_validation_is_bounded_and_rejects_injected_fields() {
        assert_eq!(check_reply(&vec![b'a'; MAX_REPLY + 1]), Err("worker-output-limit"));
        assert_eq!(check_reply(b"not-json"), Err("worker-protocol"));
        assert_eq!(check_reply(br#"{"ok":true,"result":{},"extra":1}"#), Err("worker-protocol"));
        assert_eq!(check_reply(br#"{"ok":false,"error":"private data"}"#), Err("worker-protocol"));
        assert!(check_reply(br#"{"ok":true,"result":[]}"#).is_ok());
    }
}
