use std::collections::HashMap;
use std::sync::mpsc;
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};

use tauri::{AppHandle, Manager, Url, WebviewUrl, WebviewWindowBuilder};
use tokio::sync::{oneshot, Mutex as AsyncMutex};

const SOLVER_LABEL: &str = "harbor-cf-solver";
const CF_TTL: Duration = Duration::from_secs(20 * 60);
const CF_RETRY_COOLDOWN: Duration = Duration::from_secs(30 * 60);

static PENDING: Mutex<Option<oneshot::Sender<String>>> = Mutex::new(None);

fn request_lock() -> &'static AsyncMutex<()> {
    static LOCK: OnceLock<AsyncMutex<()>> = OnceLock::new();
    LOCK.get_or_init(|| AsyncMutex::new(()))
}

struct CfEntry {
    cookie: String,
    ua: String,
    at: Instant,
}

fn cf_cache() -> &'static Mutex<HashMap<String, CfEntry>> {
    static C: OnceLock<Mutex<HashMap<String, CfEntry>>> = OnceLock::new();
    C.get_or_init(|| Mutex::new(HashMap::new()))
}

fn last_ua() -> &'static Mutex<String> {
    static U: OnceLock<Mutex<String>> = OnceLock::new();
    U.get_or_init(|| Mutex::new(String::new()))
}

// Cached (Cookie header, User-Agent) for a host that already cleared a Cloudflare
// challenge in the solver webview. cf_clearance is UA-bound, so both must be replayed
// together, and only for the exact host that solved.
pub fn cf_cached(host: &str) -> Option<(String, String)> {
    let cache = cf_cache().lock().unwrap();
    let e = cache.get(host)?;
    if e.at.elapsed() > CF_TTL {
        return None;
    }
    Some((e.cookie.clone(), e.ua.clone()))
}

pub fn cf_invalidate(host: &str) {
    cf_cache().lock().unwrap().remove(host);
}

fn cf_failures() -> &'static Mutex<HashMap<String, Instant>> {
    static F: OnceLock<Mutex<HashMap<String, Instant>>> = OnceLock::new();
    F.get_or_init(|| Mutex::new(HashMap::new()))
}

fn host_of(url: &str) -> Option<String> {
    Url::parse(url).ok()?.host_str().map(|s| s.to_string())
}

fn is_batcave_host(host: &str) -> bool {
    matches!(host, "batcave.biz" | "www.batcave.biz")
}

fn has_dle_guard_cookie(cookie: &str) -> bool {
    cookie.split(';').any(|part| part.trim().starts_with("__guard_trust="))
}

fn cf_in_cooldown(host: &str) -> bool {
    let mut map = cf_failures().lock().unwrap();
    let fresh = map.get(host).map(|at| at.elapsed() < CF_RETRY_COOLDOWN);
    match fresh {
        Some(true) => true,
        Some(false) => {
            map.remove(host);
            false
        }
        None => false,
    }
}

fn cf_note_failure(host: &str) {
    cf_failures()
        .lock()
        .unwrap()
        .insert(host.to_string(), Instant::now());
}

fn cf_clear_failure(host: &str) {
    cf_failures().lock().unwrap().remove(host);
}

/// Must already be on the main thread. Topmost is set before the window is shown
/// because Windows refuses SetForegroundWindow to a process that does not own the
/// current foreground window, which left the check sitting behind Harbor.
fn raise_window(w: &tauri::WebviewWindow) {
    let _ = w.unminimize();
    let _ = w.set_always_on_top(true);
    let _ = w.show();
    let _ = w.set_focus();
}

struct SolverDismiss(AppHandle);

impl Drop for SolverDismiss {
    fn drop(&mut self) {
        if let Some(w) = self.0.get_webview_window(SOLVER_LABEL) {
            let _ = w.set_always_on_top(false);
            let _ = w.hide();
        }
    }
}

fn is_replay_cookie(name: &str) -> bool {
    name == "cf_clearance" || name == "__cf_bm" || name.starts_with("cf_chl") || name == "__guard_trust"
}

fn harvest(app: &AppHandle, url: &str) -> bool {
    let Some(win) = app.get_webview_window(SOLVER_LABEL) else {
        return false;
    };
    let Ok(parsed) = Url::parse(url) else {
        return false;
    };
    let Some(host) = parsed.host_str().map(|s| s.to_string()) else {
        return false;
    };
    // The challenge page is a remote origin and cannot be relied on to
    // invoke native commands. The solver WebView explicitly uses this UA,
    // ensuring the replayed request and its trust cookie share an identity.
    let ua = crate::http_fetch::BROWSER_UA.to_string();
    let cookies = match win.cookies_for_url(parsed) {
        Ok(c) => c,
        Err(e) => {
            eprintln!("[cf] cookie read failed: {e}");
            return false;
        }
    };
    let mut parts: Vec<String> = Vec::new();
    for c in cookies {
        let name = c.name();
        if is_replay_cookie(name) {
            parts.push(format!("{}={}", name, c.value()));
        }
    }
    if parts.is_empty() {
        return false;
    }
    let cookie = parts.join("; ");
    cf_cache().lock().unwrap().insert(
        host.clone(),
        CfEntry {
            cookie,
            ua,
            at: Instant::now(),
        },
    );
    eprintln!("[cf] harvested clearance for {}", host);
    true
}

const INIT_SCRIPT: &str = r#"
(function () {
  if (window.__harborCfBooted) return;
  window.__harborCfBooted = true;
  // Report the user agent immediately. A DLE interstitial may never reach
  // the normal report() path until its HttpOnly cookie has been issued.
  try { window.__TAURI_INTERNALS__.invoke('cf_report', { body: '', ua: navigator.userAgent || '' }); } catch (e) {}
  var done = false;
  function challenged() {
    var t = (document.title || '').toLowerCase();
    // DLE Guard's /_c interstitial navigates away once the trust cookie is set.
    if (/^\/_(?:c|v)(?:\/|$)/.test(location.pathname || '')) return true;
    if (t.indexOf('just a moment') >= 0 || t.indexOf('attention required') >= 0) return true;
    if (document.getElementById('challenge-running') || document.getElementById('cf-please-wait')) return true;
    if (document.querySelector('#challenge-form, #cf-challenge-running, .cf-turnstile')) return true;
    return false;
  }
  function send(body) {
    try { window.__TAURI_INTERNALS__.invoke('cf_report', { body: body, ua: navigator.userAgent || '' }); } catch (e) {}
  }
  function report() {
    if (done || challenged()) return;
    done = true;
    fetch(location.href, { credentials: 'include', headers: { Accept: 'application/json, text/plain, */*' } })
      .then(function (r) { return r.text(); })
      .then(function (t) { send(t); })
      .catch(function () { send(document.body ? document.body.innerText || '' : ''); });
  }
  var tries = 0;
  var iv = setInterval(function () {
    tries += 1;
    report();
    if (done || tries > 220) clearInterval(iv);
  }, 400);
  document.addEventListener('DOMContentLoaded', report);
  window.addEventListener('load', report);
})();
"#;

#[tauri::command]
pub fn cf_report(body: String, ua: String) {
    eprintln!("[cf] report {} bytes", body.len());
    if !ua.is_empty() {
        *last_ua().lock().unwrap() = ua;
    }
    if !body.is_empty() {
        if let Some(tx) = PENDING.lock().unwrap().take() {
            let _ = tx.send(body);
        }
    }
}

fn open_solver(app: &AppHandle, url: &str) -> Result<(), String> {
    if let Some(existing) = app.get_webview_window(SOLVER_LABEL) {
        eprintln!("[cf] reusing solver window");
        let _ = existing.eval(&format!(
            "window.location.href = {};",
            serde_json::to_string(url).unwrap_or_else(|_| "''".into())
        ));
        let w = existing.clone();
        let _ = app.run_on_main_thread(move || raise_window(&w));
        return Ok(());
    }

    let parsed = Url::parse(url).map_err(|e| format!("url: {e}"))?;
    let app_main = app.clone();
    let (tx, rx) = mpsc::channel::<Result<(), String>>();
    app.run_on_main_thread(move || {
        let builder =
            WebviewWindowBuilder::new(&app_main, SOLVER_LABEL, WebviewUrl::External(parsed))
                .title("Harbor · checking source")
                .user_agent(crate::http_fetch::BROWSER_UA)
                .inner_size(480.0, 640.0)
                .center()
                .resizable(true)
                .decorations(true)
                .shadow(true)
                .focused(true)
                .initialization_script(INIT_SCRIPT);
        let built = crate::browser_args::match_main(&app_main, builder).build();
        match built {
            Ok(window) => {
                raise_window(&window);
                eprintln!("[cf] solver window built + shown");
                let _ = tx.send(Ok(()));
            }
            Err(e) => {
                eprintln!("[cf] build FAILED: {e}");
                let _ = tx.send(Err(format!("build: {e}")));
            }
        }
    })
    .map_err(|e| format!("main thread: {e}"))?;
    rx.recv_timeout(Duration::from_secs(8))
        .map_err(|e| format!("build wait: {e}"))?
}

pub async fn cf_fetch(app: AppHandle, url: String) -> Result<String, String> {
    let _guard = request_lock().lock().await;
    let host = host_of(&url);
    if let Some(h) = host.as_deref() {
        // Multiple concurrent source requests may have queued a solve. Avoid
        // reopening the WebView after the first request established trust.
        if is_batcave_host(h)
            && cf_cached(h).is_some_and(|(cookie, _)| has_dle_guard_cookie(&cookie))
        {
            return Ok(String::new());
        }
        if cf_in_cooldown(h) {
            eprintln!("[cf] skipping {}, a recent solve failed", h);
            return Err(format!("cloudflare challenge for {} recently failed", h));
        }
        cf_note_failure(h);
    }
    let (tx, rx) = oneshot::channel::<String>();
    *PENDING.lock().unwrap() = Some(tx);

    eprintln!("[cf] solving {}", url);
    open_solver(&app, &url)?;
    let _dismiss = SolverDismiss(app.clone());
    if let Some(w) = app.get_webview_window(SOLVER_LABEL) {
        // Raising a window re-enters the platform event loop. Driving that inline from
        // this async task overflowed the main thread's stack and took the app down, so
        // the raise is handed to the main thread and never blocks the solve.
        let raise = app.run_on_main_thread(move || raise_window(&w));
        if let Err(error) = raise {
            eprintln!("[cf] could not raise solver window: {error}");
        } else {
            eprintln!("[cf] raised solver window to front");
        }
    }

    // BatCave's DLE Guard can display a normal-looking page before its trust
    // cookie exists. Wait for that cookie rather than any incidental page body.
    if host.as_deref().is_some_and(is_batcave_host) {
        let ready = tokio::time::timeout(Duration::from_secs(90), async {
            loop {
                let check_app = app.clone();
                let check_url = url.clone();
                let harvested = tokio::task::spawn_blocking(move || harvest(&check_app, &check_url))
                    .await
                    .unwrap_or(false);
                if harvested
                    && host.as_deref().and_then(cf_cached)
                        .is_some_and(|(cookie, _)| has_dle_guard_cookie(&cookie))
                {
                    return true;
                }
                tokio::time::sleep(Duration::from_millis(500)).await;
            }
        })
        .await;
        PENDING.lock().unwrap().take();
        if matches!(ready, Ok(true)) {
            if let Some(h) = host.as_deref() {
                cf_clear_failure(h);
            }
            return Ok(String::new());
        }
        return Err("BatCave WebView did not issue a DLE Guard trust cookie".into());
    }

    match tokio::time::timeout(Duration::from_secs(90), rx).await {
        Ok(Ok(body)) => {
            eprintln!("[cf] got {} bytes", body.len());
            let cleared = harvest(&app, &url);
            if cleared {
                if let Some(h) = host.as_deref() {
                    cf_clear_failure(h);
                }
            }
            Ok(body)
        }
        _ => {
            PENDING.lock().unwrap().take();
            eprintln!("[cf] TIMEOUT {}", url);
            Err("cloudflare challenge timed out".into())
        }
    }
}


/// Explicit, user-triggered WebView warm-up for BatCave's DLE Guard.
/// Only the native process handles the cookie; it is never returned to JavaScript.
#[tauri::command]
pub async fn cf_prepare_batcave(app: AppHandle) -> Result<bool, String> {
    const HOST: &str = "batcave.biz";
    let has_trust = || cf_cached(HOST).is_some_and(|(cookie, _)| has_dle_guard_cookie(&cookie));
    if has_trust() {
        return Ok(true);
    }
    // Explicit user action can retry after an earlier automatic solve failed.
    cf_clear_failure(HOST);
    cf_fetch(app, "https://batcave.biz/comix/".to_string()).await?;
    Ok(has_trust())
}




const BATCAVE_BROWSER_PROBE_SCRIPT: &str = r#"
(() => {
  try {
    const originAllowed =
      location.protocol === 'https:' &&
      (location.hostname === 'batcave.biz' || location.hostname === 'www.batcave.biz');
    if (!originAllowed) {
      return { state: 'wrong-origin', pageKind: 'unknown', catalogueItems: 0,
        fetchState: 'not-run', fetchStatus: null, fetchKind: 'unknown' };
    }
    const classify = (content, count) => {
      const html = String(content || '').slice(0, 500000).toLowerCase();
      if (/just a moment|cf-challenge|challenge-platform|cf-turnstile/.test(html)) return 'cloudflare';
      if (/the signal.s up. the door isn.t/.test(html) ||
          (/sign in|log in/.test(html) && /password|magic link|discord/.test(html))) return 'login';
      if (count > 0 || /class=["'][^"']*\breaded\b/.test(html)) return 'catalogue';
      if (/\/_c(?:\/|$)/.test(location.pathname)) return 'dle';
      return 'unknown';
    };
    const pageHtml = document.documentElement?.outerHTML || '';
    const catalogueItems = document.querySelectorAll(
      '#dle-content .readed, #content-load .latest'
    ).length;
    if (!window.__harborBatcaveOriginProbe) {
      window.__harborBatcaveOriginProbe = {
        fetchState: 'pending', fetchStatus: null, fetchKind: 'unknown'
      };
      // Fixed, same-origin, credentialed GET. Never send content/cookies to Harbor.
      fetch('/comix/', {
        method: 'GET', credentials: 'same-origin', cache: 'no-store',
        redirect: 'follow', headers: { Accept: 'text/html,application/xhtml+xml,*/*' }
      })
        .then(async response => {
          const html = (await response.text()).slice(0, 500000);
          window.__harborBatcaveOriginProbe = {
            fetchState: 'done', fetchStatus: response.status,
            fetchKind: classify(html, 0)
          };
        })
        .catch(() => {
          window.__harborBatcaveOriginProbe = {
            fetchState: 'failed', fetchStatus: null, fetchKind: 'unknown'
          };
        });
    }
    return {
      state: 'ready',
      pageKind: classify(pageHtml, catalogueItems),
      catalogueItems: Math.min(catalogueItems, 10000),
      ...window.__harborBatcaveOriginProbe
    };
  } catch (_) {
    return { state: 'script-error', pageKind: 'unknown', catalogueItems: 0,
      fetchState: 'failed', fetchStatus: null, fetchKind: 'unknown' };
  }
})()
"#;

/// A fixed, read-only diagnostic: only enums, counts and status codes leave the
/// WebView. The origin is checked again in native code before invoking JS.
#[derive(Default, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct BatcaveBrowserProbe {
    state: String,
    page_kind: String,
    catalogue_items: usize,
    fetch_state: String,
    fetch_status: Option<u16>,
    fetch_kind: String,
}

fn parse_browser_probe(raw: &str) -> Option<BatcaveBrowserProbe> {
    let value: serde_json::Value = serde_json::from_str(raw).ok()?;
    // Tauri serializes the return value to JSON; on some runtimes it is a
    // JSON-encoded string, and on others it is the object directly.
    if let Some(encoded) = value.as_str() {
        serde_json::from_str(encoded).ok()
    } else {
        serde_json::from_value(value).ok()
    }
}

async fn inspect_batcave_browser(app: &AppHandle) -> BatcaveBrowserProbe {
    let mut fallback = BatcaveBrowserProbe {
        state: "no-webview".into(),
        ..Default::default()
    };
    let Some(win) = app.get_webview_window(SOLVER_LABEL) else {
        return fallback;
    };
    let Ok(url) = win.url() else {
        fallback.state = "no-url".into();
        return fallback;
    };
    if url.scheme() != "https"
        || !url.host_str().is_some_and(is_batcave_host)
    {
        fallback.state = "wrong-origin".into();
        return fallback;
    }

    for _ in 0..10 {
        let (tx, rx) = oneshot::channel::<String>();
        let pending = Mutex::new(Some(tx));
        if win
            .eval_with_callback(BATCAVE_BROWSER_PROBE_SCRIPT, move |response| {
                if let Ok(mut guard) = pending.lock() {
                    if let Some(sender) = guard.take() {
                        let _ = sender.send(response);
                    }
                }
            })
            .is_err()
        {
            fallback.state = "eval-failed".into();
            return fallback;
        }
        let raw = match tokio::time::timeout(Duration::from_secs(4), rx).await {
            Ok(Ok(raw)) => raw,
            _ => {
                fallback.state = "callback-timeout".into();
                return fallback;
            }
        };
        if let Some(probe) = parse_browser_probe(&raw) {
            if probe.fetch_state != "pending" {
                return probe;
            }
            fallback = probe;
        } else {
            fallback.state = "invalid-result".into();
            return fallback;
        }
        tokio::time::sleep(Duration::from_millis(450)).await;
    }
    fallback
}

/// Explicit, read-only BatCave connection probe. Intentionally exposes no
/// raw cookies, headers, page contents, account information, or API keys.
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BatcaveConnectionDiagnostic {
    pub webview_cookie_present: bool,
    pub cached_cookie_present: bool,
    pub user_agent_matches: bool,
    pub catalogue_status: Option<u16>,
    pub redirected_to_guard: bool,
    pub network_error: Option<String>,
    pub browser_state: String,
    pub browser_page_kind: String,
    pub browser_catalogue_items: usize,
    pub browser_fetch_state: String,
    pub browser_fetch_status: Option<u16>,
    pub browser_fetch_kind: String,
}

#[tauri::command]
pub async fn batcave_connection_diagnostic(app: AppHandle) -> BatcaveConnectionDiagnostic {
    const URL: &str = "https://batcave.biz/comix/";
    const HOST: &str = "batcave.biz";
    let browser = inspect_batcave_browser(&app).await;

    let webview_cookie_present = app
        .get_webview_window(SOLVER_LABEL)
        .and_then(|win| {
            let url = Url::parse(URL).ok()?;
            win.cookies_for_url(url).ok()
        })
        .map(|cookies| {
            cookies
                .iter()
                .any(|cookie| cookie.name() == "__guard_trust" && !cookie.value().is_empty())
        })
        .unwrap_or(false);

    let cached = cf_cached(HOST);
    let cached_cookie_present = cached
        .as_ref()
        .is_some_and(|(cookie, _)| has_dle_guard_cookie(cookie));
    let user_agent_matches = cached
        .as_ref()
        .is_some_and(|(_, ua)| ua == crate::http_fetch::BROWSER_UA);

    let mut diagnostic = BatcaveConnectionDiagnostic {
        webview_cookie_present,
        cached_cookie_present,
        user_agent_matches,
        catalogue_status: None,
        redirected_to_guard: false,
        network_error: None,
        browser_state: browser.state,
        browser_page_kind: browser.page_kind,
        browser_catalogue_items: browser.catalogue_items,
        browser_fetch_state: browser.fetch_state,
        browser_fetch_status: browser.fetch_status,
        browser_fetch_kind: browser.fetch_kind,
    };

    // This tests the same catalogue POST that the native BatCave plugin uses,
    // without triggering another challenge WebView or following its /_c redirect.
    let client = match crate::http_fetch::http_client_builder().build() {
        Ok(client) => client,
        Err(_) => {
            diagnostic.network_error = Some("Could not initialize HTTP client".into());
            return diagnostic;
        }
    };
    let mut request = client
        .post(URL)
        .timeout(Duration::from_secs(12))
        .header(reqwest::header::USER_AGENT, crate::http_fetch::BROWSER_UA)
        .header(reqwest::header::ACCEPT, "text/html,application/xhtml+xml,*/*")
        .header(reqwest::header::CONTENT_TYPE, "application/x-www-form-urlencoded")
        .body("dlenewssortby=rating&dledirection=desc&set_new_sort=dle_sort_cat_1&set_direction_sort=dle_direction_cat_1");
    if let Some((cookie, _)) = cached {
        request = request.header(reqwest::header::COOKIE, cookie);
    }

    match request.send().await {
        Ok(response) => {
            diagnostic.catalogue_status = Some(response.status().as_u16());
            diagnostic.redirected_to_guard = response
                .headers()
                .get(reqwest::header::LOCATION)
                .and_then(|value| value.to_str().ok())
                .and_then(|value| reqwest::Url::parse(URL).ok()?.join(value).ok())
                .is_some_and(|redirect| {
                    matches!(redirect.host_str(), Some("batcave.biz" | "www.batcave.biz"))
                        && redirect.path().split('/').nth(1) == Some("_c")
                });
        }
        Err(error) => {
            diagnostic.network_error = Some(if error.is_timeout() {
                "Connection timed out".into()
            } else if error.is_connect() {
                "Could not connect to BatCave".into()
            } else {
                "HTTP request failed".into()
            });
        }
    }

    diagnostic
}

#[cfg(test)]
mod batcave_session_tests {
    use super::{has_dle_guard_cookie, is_batcave_host, is_replay_cookie, parse_browser_probe};

    #[test]
    fn browser_probe_decodes_direct_and_serialized_values() {
        let payload = r#"{"state":"ready","pageKind":"cloudflare","catalogueItems":0,"fetchState":"done","fetchStatus":403,"fetchKind":"cloudflare"}"#;
        let direct = parse_browser_probe(payload).expect("direct object");
        assert_eq!(direct.fetch_status, Some(403));
        assert_eq!(direct.fetch_kind, "cloudflare");
        let serialized = serde_json::to_string(payload).unwrap();
        let nested = parse_browser_probe(&serialized).expect("serialized object");
        assert_eq!(nested.page_kind, "cloudflare");
        assert_eq!(nested.catalogue_items, 0);
    }

    #[test]
    fn only_batcave_hosts_can_use_dle_guard() {
        assert!(is_batcave_host("batcave.biz"));
        assert!(is_batcave_host("www.batcave.biz"));
        assert!(!is_batcave_host("fakebatcave.biz"));
        assert!(!is_batcave_host("batcave.biz.evil.test"));
        assert!(has_dle_guard_cookie("cf_clearance=abc; __guard_trust=ok"));
        assert!(!has_dle_guard_cookie("__guard_trust_fake=bad"));
    }

    #[test]
    fn keep_expected_guard_and_cloudflare_cookies_only() {
        for name in ["__guard_trust", "cf_clearance", "__cf_bm", "cf_chl_2"] {
            assert!(is_replay_cookie(name), "{name}");
        }
        for name in ["session", "auth", "remember_me", "__other_guard"] {
            assert!(!is_replay_cookie(name), "{name}");
        }
    }
}
