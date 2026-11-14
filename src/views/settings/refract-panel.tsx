import { useEffect, useState, type FormEvent } from "react";
import { useT } from "@/lib/i18n";
import {
  getRefractKey,
  refractEnabled,
  saveRefractKey,
  setRefractEnabled,
  verifyRefractKey,
} from "@/lib/refract/client";
import {
  refractStatus,
  resetRefractSync,
  retryRefractSync,
  startRefractSync,
  subscribeRefractStatus,
} from "@/lib/refract/sync";
import {
  pollRefractInbound,
  refractInboundStatus,
  resetRefractInboundSync,
} from "@/lib/refract/inbound";
import { Section, ToggleRow } from "./shared";
import { ROW_ACTION_PRIMARY, ROW_DESC } from "./kit";

export function RefractPanel() {
  const t = useT();
  const [connected, setConnected] = useState(() => getRefractKey() !== null);
  const [enabled, setEnabled] = useState(() => refractEnabled());
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [status, setStatus] = useState(refractStatus);
  const [incoming, setIncoming] = useState(refractInboundStatus);

  useEffect(
    () =>
      subscribeRefractStatus(() => {
        setStatus(refractStatus());
        setIncoming(refractInboundStatus());
      }),
    [],
  );

  const connect = async (event: FormEvent) => {
    event.preventDefault();
    const key = input.trim();
    if (!key) return;
    setBusy(true);
    setMessage("");
    try {
      const identity = await verifyRefractKey(key);
      // Never replay watches from another Refract account after replacing a key.
      resetRefractSync();
      resetRefractInboundSync();
      saveRefractKey(key);
      setRefractEnabled(true);
      setConnected(true);
      setEnabled(true);
      setInput("");
      setMessage(`Connected to Refract (${identity}). Watched history sync is enabled.`);
      startRefractSync();
      void pollRefractInbound();
    } catch {
      setMessage(
        "Could not verify the key via Refract /v1/me. Check permissions and connectivity.",
      );
    } finally {
      setBusy(false);
    }
  };

  const disconnect = () => {
    setRefractEnabled(false);
    saveRefractKey(null);
    resetRefractSync();
    resetRefractInboundSync();
    setConnected(false);
    setEnabled(false);
    setMessage("Disconnected from Refract.");
  };

  return (
    <Section
      title={t("Refract watched-history sync")}
      subtitle={t("Sync completed movies and episodes between Harbor and Refract.")}
    >
      {!connected ? (
        <form onSubmit={connect} className="flex max-w-xl flex-col gap-3">
          <p className={ROW_DESC}>
            Create a Refract API key with profile:read, library:read, history:read and
            history:write. Never share or commit the key.
          </p>
          <label htmlFor="refract-api-key" className="text-[14px] font-medium text-ink">
            {t("Refract personal API key")}
          </label>
          <div className="flex items-center gap-2">
            <input
              id="refract-api-key"
              type={showKey ? "text" : "password"}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="rfk_..."
              autoComplete="off"
              spellCheck={false}
              className="h-11 min-w-0 flex-1 rounded-[10px] border border-edge bg-elevated px-3 font-mono text-[14px] text-ink"
            />
            <button
              type="button"
              onClick={() => setShowKey((v) => !v)}
              className="h-11 rounded-[10px] border border-edge px-3 text-ink-muted"
            >
              {showKey ? t("Hide") : t("Show")}
            </button>
          </div>
          <button type="submit" disabled={busy || !input.trim()} className={ROW_ACTION_PRIMARY}>
            {busy ? t("Verifying...") : t("Connect Refract")}
          </button>
        </form>
      ) : (
        <div className="flex flex-col gap-5">
          <p className="text-[14px] text-ink">
            {t("Refract key saved in Harbor's credential store")}
          </p>
          <ToggleRow
            label={t("Sync watched movies and episodes in both directions")}
            sub={t(
              "Refract imports add verified watches without removing local history. Only the primary Harbor profile is synced.",
            )}
            value={enabled}
            onChange={(value) => {
              setRefractEnabled(value);
              setEnabled(value);
              if (value) {
                retryRefractSync();
                void pollRefractInbound();
              }
            }}
          />
          <p className={ROW_DESC}>
            {status.synced} sent · {status.pending} pending · {status.failed} unmatched
            {status.message ? ` · ${status.message}` : ""}
          </p>
          <p className={ROW_DESC}>
            Refract → Harbor: {incoming.imported} imported ·{" "}
            {incoming.active ? "up to date" : incoming.phase}
            {incoming.error ? ` · ${incoming.error}` : ""}
          </p>
          {status.failures.length > 0 && (
            <details className="text-[13px] text-ink-muted">
              <summary>Unmatched items</summary>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                {status.failures.map((reason, i) => (
                  <li key={i}>{reason}</li>
                ))}
              </ul>
            </details>
          )}
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => {
                retryRefractSync();
                void pollRefractInbound();
              }}
              className="rounded-[10px] border border-edge px-4 py-2 text-ink"
            >
              {t("Retry pending watches")}
            </button>
            <button
              type="button"
              onClick={disconnect}
              className="rounded-[10px] border border-danger px-4 py-2 text-danger"
            >
              {t("Disconnect Refract")}
            </button>
          </div>
        </div>
      )}
      {message && (
        <p role="status" className={ROW_DESC}>
          {message}
        </p>
      )}
    </Section>
  );
}
