//! Development supervisor. Only the trusted compiled-in fixture protocol is accepted.
//! A separate Linux experiment requires real namespace isolation; there is no fallback.
use serde_json::Value;
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
        let mut child = cmd.spawn().map_err(|_| "worker-spawn")?;
        let mut stdin = child.stdin.take().ok_or("worker-stdin")?;
        let stdout = child.stdout.take().ok_or("worker-stdout")?;
        let mut out = Vec::new();
        let result = tokio::time::timeout(self.wall, async {
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

    pub async fn run_fixture(&self, request: &Value) -> Result<Value, &'static str> {
        let input = serde_json::to_vec(request).map_err(|_| "invalid-request")?;
        crate::validated_request(&input)?;
        self.exchange(&[], &input).await
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
