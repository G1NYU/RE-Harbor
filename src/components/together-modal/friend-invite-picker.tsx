import { Check, Loader2, Search, Send, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useT } from "@/lib/i18n";
import { fetchFriends, type Friend } from "@/lib/social/friends";
import {
  listRoomPartyInvites,
  revokePartyInvite,
  sendPartyInvites,
  type PartyInvite,
} from "@/lib/social/party-invites";
import { refreshPartyInvites } from "@/lib/social/party-invite-store";

const MAX_RECIPIENTS = 20;

/**
 * Invite friends to the party that is already running. The room and relay base come
 * from the caller, because they are the party's, not this component's: an invitation
 * only ever points at a room that exists.
 */
export function FriendInvitePicker({
  room,
  relayUrl,
  mediaTitle,
}: {
  room: string;
  relayUrl: string;
  mediaTitle?: string;
}) {
  const t = useT();
  const [friends, setFriends] = useState<Friend[]>([]);
  const [pending, setPending] = useState<PartyInvite[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);

  useEffect(() => {
    const ac = new AbortController();
    setLoading(true);
    Promise.all([
      fetchFriends(ac.signal).catch(() => [] as Friend[]),
      listRoomPartyInvites(room, ac.signal).catch(() => ({ pending: [], recent: [] })),
    ])
      .then(([rows, invites]) => {
        if (ac.signal.aborted) return;
        setFriends(rows);
        setPending(invites.pending);
      })
      .finally(() => {
        if (!ac.signal.aborted) setLoading(false);
      });
    return () => ac.abort();
  }, [room]);

  // Someone already invited should not be offered again: the server is idempotent,
  // but showing them twice invites the user to send a second, pointless request.
  const invitedIds = useMemo(
    () => new Set(pending.map((p) => p.to?.id).filter(Boolean) as string[]),
    [pending],
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return friends
      .filter((f) => (f.id ? !invitedIds.has(f.id) : true))
      .filter((f) => {
        if (!q) return true;
        return (
          (f.alias || "").toLowerCase().includes(q) || (f.handle || "").toLowerCase().includes(q)
        );
      })
      .slice(0, 60);
  }, [friends, invitedIds, query]);

  const toggle = (id: string) => {
    setSelected((cur) => {
      if (cur.includes(id)) return cur.filter((x) => x !== id);
      if (cur.length >= MAX_RECIPIENTS) return cur;
      return [...cur, id];
    });
    setSent(0);
    setError(null);
  };

  const send = () => {
    if (!selected.length || sending) return;
    setSending(true);
    setError(null);
    sendPartyInvites({ roomCode: room, relayUrl, mediaTitle, userIds: selected })
      .then((res) => {
        setSent(res.invites.length);
        setSelected([]);
        setPending((cur) => [
          ...res.invites,
          ...cur.filter((p) => !res.invites.some((i) => i.id === p.id)),
        ]);
        void refreshPartyInvites();
        const blocked = res.skipped.filter((s) => s.reason === "blocked").length;
        if (blocked) setError(t("{count} could not be invited.", { count: blocked }));
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : t("Invitations could not be sent."));
      })
      .finally(() => setSending(false));
  };

  const revoke = (id: string) => {
    setRevoking(id);
    revokePartyInvite(id)
      .then(() => setPending((cur) => cur.filter((p) => p.id !== id)))
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : t("That invitation could not be cancelled."));
      })
      .finally(() => setRevoking(null));
  };

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-edge bg-canvas/60 p-3.5">
      <div className="flex items-center justify-between">
        <span className="text-[10.5px] uppercase tracking-wider text-ink-subtle">
          {t("Invite friends")}
        </span>
        {sent > 0 && (
          <span className="flex items-center gap-1 text-[11.5px] font-medium text-ink-muted">
            <Check size={13} strokeWidth={2.6} />
            {t("Invited")}
          </span>
        )}
      </div>

      <div className="relative">
        <Search
          size={14}
          strokeWidth={2.2}
          className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-ink-subtle"
        />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("Search friends")}
          className="h-9 w-full rounded-lg border border-edge bg-canvas ps-8 pe-3 text-[12.5px] text-ink outline-none placeholder:text-ink-subtle focus:border-edge/80"
        />
      </div>

      <div className="flex max-h-52 flex-col gap-1 overflow-y-auto">
        {loading && (
          <div className="flex items-center justify-center py-4 text-ink-subtle">
            <Loader2 size={15} className="animate-spin" />
          </div>
        )}
        {!loading && !visible.length && (
          <p className="py-3 text-center text-[12px] text-ink-muted">
            {query
              ? t("No friends match that search.")
              : t("Everyone you can invite is already invited.")}
          </p>
        )}
        {visible.map((f) => {
          const id = f.id as string | undefined;
          const checked = !!id && selected.includes(id);
          return (
            <button
              key={id || f.handle}
              type="button"
              disabled={!id}
              onClick={() => id && toggle(id)}
              aria-pressed={checked}
              className={`flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-start transition-colors ${
                checked ? "bg-elevated" : "hover:bg-elevated/60"
              } ${id ? "" : "opacity-50"}`}
            >
              <span
                className={`grid h-4 w-4 shrink-0 place-items-center rounded-[5px] border ${
                  checked ? "border-ink bg-ink text-canvas" : "border-edge"
                }`}
              >
                {checked && <Check size={11} strokeWidth={3} />}
              </span>
              {f.avatarUrl ? (
                <img
                  src={f.avatarUrl}
                  alt=""
                  className="h-7 w-7 rounded-full object-cover"
                  draggable={false}
                />
              ) : (
                <span className="grid h-7 w-7 place-items-center rounded-full bg-elevated text-[11px] font-semibold text-ink-muted">
                  {(f.alias || f.handle || "?").slice(0, 1).toUpperCase()}
                </span>
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12.5px] text-ink">{f.alias || f.handle}</span>
                <span className="block truncate text-[11px] text-ink-subtle">@{f.handle}</span>
              </span>
            </button>
          );
        })}
      </div>

      <button
        type="button"
        onClick={send}
        disabled={!selected.length || sending}
        className="flex h-10 items-center justify-center gap-2 rounded-lg bg-ink text-[13px] font-semibold text-canvas transition-transform enabled:hover:scale-[1.01] disabled:opacity-50"
      >
        {sending ? (
          <Loader2 size={14} className="animate-spin" />
        ) : (
          <Send size={14} strokeWidth={2.4} />
        )}
        {selected.length
          ? t("Send {count} invitations", { count: selected.length })
          : t("Select friends to invite")}
      </button>

      {error && <p className="text-[11.5px] leading-snug text-ink-muted">{error}</p>}

      {pending.length > 0 && (
        <div className="flex flex-col gap-1.5 border-t border-edge pt-2.5">
          <span className="text-[10.5px] uppercase tracking-wider text-ink-subtle">
            {t("Waiting on {count}", { count: pending.length })}
          </span>
          {pending.map((inv) => (
            <div key={inv.id} className="flex items-center gap-2 text-[12px] text-ink-muted">
              <span className="min-w-0 flex-1 truncate">
                {inv.to?.displayName || inv.to?.handle || t("Someone")}
              </span>
              <button
                type="button"
                onClick={() => revoke(inv.id)}
                disabled={revoking === inv.id}
                aria-label={t("Cancel invitation")}
                className="grid h-6 w-6 place-items-center rounded-full text-ink-subtle transition-colors hover:bg-elevated hover:text-ink disabled:opacity-50"
              >
                {revoking === inv.id ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  <X size={13} strokeWidth={2.4} />
                )}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
