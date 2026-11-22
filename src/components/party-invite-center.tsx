import { Loader2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useT } from "@/lib/i18n";
import {
  acceptInvite,
  declineInvite,
  refreshPartyInvites,
  startPartyInvitePolling,
  subscribePartyInvitesOpen,
  usePartyInvites,
} from "@/lib/social/party-invite-store";
import type { PartyInvite } from "@/lib/social/party-invites";

function timeLeft(expiresAt: string): string {
  const ms = Date.parse(expiresAt) - Date.now();
  if (!Number.isFinite(ms) || ms <= 0) return "";
  const mins = Math.max(1, Math.round(ms / 60_000));
  return mins >= 60 ? `${Math.round(mins / 60)}h` : `${mins}m`;
}

function InviteRow({
  invite,
  busy,
  onAccept,
  onDecline,
}: {
  invite: PartyInvite;
  busy: boolean;
  onAccept: () => void;
  onDecline: () => void;
}) {
  const t = useT();
  const left = timeLeft(invite.expiresAt);
  return (
    <div className="flex flex-col gap-2.5 rounded-xl border border-edge bg-canvas/60 p-3">
      <div className="flex items-start gap-2.5">
        {invite.from?.avatarUrl ? (
          <img
            src={invite.from.avatarUrl}
            alt=""
            className="h-9 w-9 shrink-0 rounded-full object-cover"
            draggable={false}
          />
        ) : (
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-elevated text-[12px] font-semibold text-ink-muted">
            {(invite.from?.displayName || invite.from?.handle || "?").slice(0, 1).toUpperCase()}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-medium text-ink">
            {invite.from?.displayName || invite.from?.handle || t("Someone")}
          </p>
          <p className="truncate text-[12px] text-ink-muted">
            {invite.mediaTitle
              ? t("Invited you to watch {title}", { title: invite.mediaTitle })
              : t("Invited you to a watch party")}
          </p>
          <p className="mt-0.5 text-[11px] text-ink-subtle">
            {t("Room")} {invite.roomCode}
            {left ? ` · ${t("expires in {time}", { time: left })}` : ""}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onAccept}
          disabled={busy}
          className="flex h-9 flex-1 items-center justify-center gap-2 rounded-lg bg-ink text-[12.5px] font-semibold text-canvas transition-transform enabled:hover:scale-[1.01] disabled:opacity-60"
        >
          {busy ? <Loader2 size={14} className="animate-spin" /> : null}
          {t("Join party")}
        </button>
        <button
          type="button"
          onClick={onDecline}
          disabled={busy}
          className="h-9 rounded-lg border border-edge px-3 text-[12.5px] font-medium text-ink-muted transition-colors enabled:hover:bg-elevated enabled:hover:text-ink disabled:opacity-60"
        >
          {t("Decline")}
        </button>
      </div>
    </div>
  );
}

/**
 * The incoming-invitation surface. Mounted once at the app root, opened from the
 * notification centre or the Together panel. Joining goes through the same invite
 * hand-off a deep link uses, so no party state is duplicated on this side.
 */
export function PartyInviteCenter() {
  const t = useT();
  const { pending, recent, loading, error } = usePartyInvites();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => subscribePartyInvitesOpen(() => setOpen(true)), []);

  // One poller for the whole app. It is the only thing that discovers an invitation
  // arriving while nothing else is open, and it stops with the component.
  useEffect(() => startPartyInvitePolling(), []);

  useEffect(() => {
    if (!open) return;
    void refreshPartyInvites();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!open) return null;

  const run = (id: string, fn: () => Promise<unknown>) => {
    setBusy(id);
    setActionError(null);
    fn()
      .catch((err: unknown) => {
        setActionError(
          err instanceof Error ? err.message : t("That invitation could not be handled."),
        );
      })
      .finally(() => setBusy(null));
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[215] bg-canvas/40"
      style={{ animation: "nc-scrim-in 160ms ease both" }}
      onClick={() => setOpen(false)}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("Watch party invitations")}
        onClick={(e) => e.stopPropagation()}
        className="harbor-together-surface animate-panel-in absolute end-4 bottom-4 flex max-h-[70vh] w-[min(360px,calc(100vw-2rem))] flex-col overflow-hidden rounded-xl shadow-[0_10px_30px_-12px_rgba(0,0,0,0.6)]"
      >
        <div className="flex items-center justify-between px-4 py-3">
          <span className="text-[14px] font-semibold tracking-tight text-ink">
            {t("Watch party invitations")}
          </span>
          <div className="flex items-center gap-1">
            {loading && <Loader2 size={14} className="animate-spin text-ink-subtle" />}
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label={t("Close")}
              className="grid h-8 w-8 place-items-center rounded-full text-ink-muted transition-colors hover:bg-elevated hover:text-ink"
            >
              <X size={16} strokeWidth={2.2} />
            </button>
          </div>
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-4 pb-4">
          {error && <p className="text-[12px] text-ink-muted">{error}</p>}
          {actionError && <p className="text-[12px] text-ink-muted">{actionError}</p>}
          {!pending.length && !loading && (
            <p className="py-6 text-center text-[12.5px] text-ink-muted">
              {t("No pending invitations.")}
            </p>
          )}
          {pending.map((invite) => (
            <InviteRow
              key={invite.id}
              invite={invite}
              busy={busy === invite.id}
              onAccept={() =>
                run(invite.id, () => acceptInvite(invite.id).then(() => setOpen(false)))
              }
              onDecline={() => run(invite.id, () => declineInvite(invite.id))}
            />
          ))}
          {!pending.length && recent.length > 0 && (
            <p className="pt-1 text-[11.5px] text-ink-subtle">
              {t("Recently declined or expired invitations are not shown again.")}
            </p>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
