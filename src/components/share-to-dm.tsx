import { useEffect, useMemo, useState } from "react";
import { Check, Loader2, Search, Send, X } from "lucide-react";
import { createPortal } from "react-dom";
import { useT } from "@/lib/i18n";
import { type DmShare } from "@/lib/social/dm";
import { openDmConversation, sendDmMessage } from "@/lib/social/dm-store";
import { refreshDm, useDmState } from "@/lib/social/dm-store";
import { fetchFriends, type Friend } from "@/lib/social/friends";
import { subscribeShareToDm } from "@/lib/social/share-dm";

const SHARE_LABEL: Record<DmShare["type"], string> = {
  profile: "profile",
  group: "group",
  title: "title",
  review: "review",
  list: "list",
};

function SharePreview({ share }: { share: DmShare }) {
  const t = useT();
  const label = share.title || share.id;
  return (
    <div className="flex items-center gap-2 rounded-lg bg-canvas/60 p-2">
      {share.poster ? (
        <img
          src={share.poster}
          alt=""
          className="h-10 w-7 shrink-0 rounded object-cover"
          draggable={false}
        />
      ) : (
        <span className="grid h-10 w-7 shrink-0 place-items-center rounded bg-elevated text-[11px] font-bold text-ink-subtle">
          {share.type === "profile" ? "@" : share.type === "group" ? "#" : "■"}
        </span>
      )}
      <span className="min-w-0">
        <span className="block truncate text-[12.5px] font-semibold text-ink">{label}</span>
        <span className="block text-[10.5px] text-ink-subtle">{t(SHARE_LABEL[share.type])}</span>
      </span>
    </div>
  );
}

/**
 * The other half of a shared reference: picking who receives it. Mounted once at the app
 * root; `requestShareToDm()` is the only thing a surface needs to call.
 */
export function ShareToDmHost() {
  const t = useT();
  const dm = useDmState();
  const [share, setShare] = useState<DmShare | null>(null);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(
    () =>
      subscribeShareToDm((next) => {
        setShare(next);
        setQuery("");
        setSentTo(null);
        setError(null);
      }),
    [],
  );

  useEffect(() => {
    if (!share) return;
    const ac = new AbortController();
    fetchFriends(ac.signal)
      .then((rows) => {
        if (!ac.signal.aborted) setFriends(rows);
      })
      .catch(() => {
        if (!ac.signal.aborted) setFriends([]);
      });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setShare(null);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      ac.abort();
      window.removeEventListener("keydown", onKey);
    };
  }, [share]);

  const conversations = useMemo(() => dm.conversations.slice(0, 6), [dm.conversations]);
  const matchingFriends = useMemo(() => {
    const q = query.trim().toLowerCase();
    return friends
      .filter(
        (f) =>
          (f.alias || "").toLowerCase().includes(q) || (f.handle || "").toLowerCase().includes(q),
      )
      .slice(0, 8);
  }, [friends, query]);

  if (!share) return null;

  const sendToConversation = async (conversationId: string, label: string) => {
    setBusy(conversationId);
    setError(null);
    try {
      await sendDmMessage(conversationId, "", share);
      setSentTo(label);
      void refreshDm({ silent: true });
    } catch (e) {
      const code = (e as { body?: { error?: string } }).body?.error;
      setError(
        code === "slow_down"
          ? t("You are sending messages too quickly. Wait a moment.")
          : e instanceof Error
            ? e.message
            : t("That could not be sent."),
      );
    } finally {
      setBusy(null);
    }
  };

  const sendToUser = async (userId: string, label: string) => {
    setBusy(userId);
    setError(null);
    try {
      const conv = await openDmConversation(userId);
      await sendDmMessage(conv.id, "", share);
      setSentTo(label);
      void refreshDm({ silent: true });
    } catch (e) {
      const code = (e as { body?: { error?: string } }).body?.error;
      setError(
        code === "dm_friends_only"
          ? t("That account only accepts messages from friends.")
          : code === "blocked"
            ? t("You cannot message that account.")
            : e instanceof Error
              ? e.message
              : t("That could not be sent."),
      );
    } finally {
      setBusy(null);
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[216] bg-canvas/40"
      style={{ animation: "nc-scrim-in 160ms ease both" }}
      onClick={() => setShare(null)}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("Send to a friend")}
        onClick={(e) => e.stopPropagation()}
        className="harbor-together-surface animate-panel-in absolute end-4 top-1/2 flex max-h-[70vh] w-[min(360px,calc(100vw-2rem))] -translate-y-1/2 flex-col overflow-hidden rounded-xl shadow-[0_10px_30px_-12px_rgba(0,0,0,0.6)]"
      >
        <div className="flex items-center justify-between px-4 py-3">
          <span className="text-[14px] font-semibold tracking-tight text-ink">
            {t("Send to a friend")}
          </span>
          <button
            type="button"
            onClick={() => setShare(null)}
            aria-label={t("Close")}
            className="grid h-8 w-8 place-items-center rounded-full text-ink-muted transition-colors hover:bg-elevated hover:text-ink"
          >
            <X size={16} strokeWidth={2.2} />
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-2 px-4 pb-4">
          <SharePreview share={share} />

          {sentTo && (
            <p className="flex items-center gap-1.5 rounded-md bg-emerald-500/10 px-2.5 py-1.5 text-[12px] text-emerald-400">
              <Check size={13} strokeWidth={3} /> {t("Sent to {name}", { name: sentTo })}
            </p>
          )}
          {error && <p className="text-[11.5px] text-danger">{error}</p>}

          {conversations.length > 0 && (
            <>
              <span className="mt-1 text-[10.5px] uppercase tracking-wider text-ink-subtle">
                {t("Recent conversations")}
              </span>
              <div className="flex flex-col gap-0.5">
                {conversations.map((c) => {
                  const label = c.other?.displayName || c.other?.handle || t("Conversation");
                  return (
                    <button
                      key={c.id}
                      type="button"
                      disabled={!!busy}
                      onClick={() => void sendToConversation(c.id, label)}
                      className="flex items-center gap-2 rounded-lg px-1.5 py-1.5 text-start transition-colors hover:bg-elevated/60 disabled:opacity-60"
                    >
                      {c.other?.avatarUrl ? (
                        <img
                          src={c.other.avatarUrl}
                          alt=""
                          className="h-7 w-7 rounded-full object-cover"
                          draggable={false}
                        />
                      ) : (
                        <span className="grid h-7 w-7 place-items-center rounded-full bg-elevated text-[11px] font-semibold text-ink-muted">
                          {label.slice(0, 1).toUpperCase()}
                        </span>
                      )}
                      <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink">
                        {label}
                      </span>
                      {busy === c.id ? (
                        <Loader2 size={13} className="animate-spin text-ink-subtle" />
                      ) : (
                        <Send size={13} className="text-ink-subtle" />
                      )}
                    </button>
                  );
                })}
              </div>
            </>
          )}

          <span className="mt-1 text-[10.5px] uppercase tracking-wider text-ink-subtle">
            {t("Friends")}
          </span>
          <div className="relative">
            <Search
              size={13}
              className="pointer-events-none absolute start-2.5 top-1/2 -translate-y-1/2 text-ink-subtle"
            />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("Search friends")}
              className="h-8 w-full rounded-full bg-elevated/60 ps-7 pe-3 text-[12px] text-ink outline-none placeholder:text-ink-subtle"
            />
          </div>
          <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto">
            {!matchingFriends.length && (
              <p className="py-2 text-[12px] text-ink-subtle">{t("No friends match.")}</p>
            )}
            {matchingFriends.map((f) => {
              const label = f.alias || f.handle;
              return (
                <button
                  key={f.id || f.handle}
                  type="button"
                  disabled={!f.id || !!busy}
                  onClick={() => f.id && void sendToUser(f.id, label)}
                  className="flex items-center gap-2 rounded-lg px-1.5 py-1.5 text-start transition-colors hover:bg-elevated/60 disabled:opacity-60"
                >
                  {f.avatarUrl ? (
                    <img
                      src={f.avatarUrl}
                      alt=""
                      className="h-7 w-7 rounded-full object-cover"
                      draggable={false}
                    />
                  ) : (
                    <span className="grid h-7 w-7 place-items-center rounded-full bg-elevated text-[11px] font-semibold text-ink-muted">
                      {label.slice(0, 1).toUpperCase()}
                    </span>
                  )}
                  <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink">{label}</span>
                  {busy === f.id ? (
                    <Loader2 size={13} className="animate-spin text-ink-subtle" />
                  ) : (
                    <Send size={13} className="text-ink-subtle" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
