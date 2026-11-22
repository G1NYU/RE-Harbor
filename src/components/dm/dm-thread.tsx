import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import {
  Archive,
  ArrowLeft,
  Bell,
  BellOff,
  Check,
  Loader2,
  Pencil,
  Send,
  Trash2,
  X,
} from "lucide-react";
import { useT } from "@/lib/i18n";
import {
  deleteDmMessage,
  editDmMessage,
  listDmMessages,
  markDmRead,
  reactToDmMessage,
  setDmMuted,
  unreactToDmMessage,
  type DmError,
  type DmMessage,
  type DmShare,
} from "@/lib/social/dm";
import {
  dmConversationById,
  refreshDm,
  useDmState,
  sendDmMessage,
  hideDmConversation,
} from "@/lib/social/dm-store";
import { dmClock, dmDay } from "@/lib/social/dm-format";
import { PRESENCE_META, presenceStatusLabel } from "@/lib/social/presence";
import { requestOpenProfile } from "@/lib/social/open-profile";
import { UserHoverCard } from "@/views/profile/user-hover-card";
import { DmAvatar } from "./dm-avatar";
import { DmReactionPicker } from "./dm-reaction-picker";

const PAGE = 30;
const POLL_MS = 6_000;

function compareMessages(a: DmMessage, b: DmMessage): number {
  const at = Date.parse(b.at) - Date.parse(a.at);
  if (at !== 0) return at;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function mergeMessages(prev: DmMessage[], incoming: DmMessage[]): DmMessage[] {
  const byId = new Map(prev.map((m) => [m.id, m]));
  for (const m of incoming) byId.set(m.id, m);
  return [...byId.values()].sort(compareMessages);
}

function friendlyError(err: unknown): string {
  const e = err as DmError;
  const code = (e.body as { error?: string } | undefined)?.error;
  if (code === "slow_down") return "You are sending messages too quickly. Wait a moment.";
  if (code === "daily_cap") return "You have reached today's message limit.";
  if (code === "too_long") return "That message is too long.";
  if (e.status === 401) return "Your session expired. Sign in again.";
  return e.message || "Something went wrong. Try again.";
}

const SHARE_ICON: Record<DmShare["type"], string> = {
  profile: "@",
  group: "#",
  title: "■",
  review: "★",
  list: "≡",
};

/** Renders a validated Harbor reference. It is a link, never remote HTML. */
function ShareCard({ share }: { share: DmShare }) {
  const label =
    share.title ||
    (share.type === "profile"
      ? `@${share.id}`
      : share.type === "group"
        ? `#${share.id}`
        : share.id);
  return (
    <div className="mb-1 flex items-center gap-2 rounded-lg bg-current/10 p-1.5 text-start">
      {share.poster ? (
        <img
          src={share.poster}
          alt=""
          className="h-10 w-7 shrink-0 rounded object-cover"
          draggable={false}
        />
      ) : (
        <span className="grid h-10 w-7 shrink-0 place-items-center rounded bg-current/10 text-[11px] font-bold">
          {SHARE_ICON[share.type]}
        </span>
      )}
      <span className="min-w-0">
        <span className="block truncate text-[12px] font-semibold">{label}</span>
        <span className="block text-[10.5px] opacity-70">{share.type}</span>
      </span>
    </div>
  );
}

export function DmThread({
  conversationId,
  onBack,
  onClose,
}: {
  conversationId: string;
  onBack: () => void;
  onClose: () => void;
}) {
  const t = useT();
  useDmState();
  const conv = dmConversationById(conversationId);
  const [messages, setMessages] = useState<DmMessage[]>([]);
  const [nextCursor, setNextCursor] = useState<string | undefined>();
  const [loading, setLoading] = useState(true);
  const [olderLoading, setOlderLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [muted, setMuted] = useState(!!conv?.muted);

  const listRef = useRef<HTMLDivElement | null>(null);
  const textRef = useRef<HTMLTextAreaElement | null>(null);
  const atBottom = useRef(true);
  const readThrough = useRef<string | null>(null);

  useEffect(() => {
    setMuted(!!conv?.muted);
  }, [conv?.muted]);

  const scrollToBottom = useCallback((smooth = false) => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
  }, []);

  const onScroll = useCallback(() => {
    const el = listRef.current;
    if (!el) return;
    atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
  }, []);

  // Initial page and background polling for the open thread.
  useEffect(() => {
    let stopped = false;
    readThrough.current = null;
    setMessages([]);
    setNextCursor(undefined);
    setError(null);
    setLoading(true);

    const ac = new AbortController();
    listDmMessages(conversationId, { limit: PAGE }, ac.signal)
      .then((page) => {
        if (stopped) return;
        setMessages(mergeMessages([], page.messages ?? []));
        setNextCursor(page.nextCursor);
      })
      .catch((err: unknown) => {
        if (stopped || (err as { name?: string }).name === "AbortError") return;
        setError(friendlyError(err));
      })
      .finally(() => {
        if (!stopped) setLoading(false);
      });

    const timer = window.setInterval(() => {
      if (document.hidden) return;
      listDmMessages(conversationId, { limit: PAGE })
        .then((page) => {
          if (stopped) return;
          setMessages((prev) => mergeMessages(prev, page.messages ?? []));
        })
        .catch(() => {});
    }, POLL_MS);

    return () => {
      stopped = true;
      ac.abort();
      window.clearInterval(timer);
    };
  }, [conversationId]);

  // A conversation that is open is read, including messages that arrive while it is open.
  useEffect(() => {
    const latest = messages[0];
    if (!latest || latest.mine) return;
    if (readThrough.current === latest.id) return;
    readThrough.current = latest.id;
    markDmRead(conversationId)
      .then(() => refreshDm({ silent: true }))
      .catch(() => {});
  }, [conversationId, messages]);

  useEffect(() => {
    if (loading) return;
    if (atBottom.current) scrollToBottom();
  }, [loading, messages, scrollToBottom]);

  useEffect(() => {
    const el = textRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 128)}px`;
  }, [draft]);

  const ordered = useMemo(() => messages.slice().reverse(), [messages]);

  const lastMine = useMemo(
    () => [...ordered].reverse().find((m) => m.mine && !m.deleted),
    [ordered],
  );
  const seen =
    !!lastMine && !!conv?.otherReadAt && Date.parse(conv.otherReadAt) >= Date.parse(lastMine.at);

  const loadOlder = async () => {
    if (!nextCursor || olderLoading) return;
    setOlderLoading(true);
    setActionError(null);
    try {
      const page = await listDmMessages(conversationId, { cursor: nextCursor, limit: PAGE });
      setMessages((prev) => mergeMessages(prev, page.messages ?? []));
      setNextCursor(page.nextCursor);
    } catch (err) {
      setActionError(friendlyError(err));
    } finally {
      setOlderLoading(false);
    }
  };

  const send = async () => {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    setActionError(null);
    try {
      const message = await sendDmMessage(conversationId, text);
      setMessages((prev) => mergeMessages(prev, [message]));
      setDraft("");
      atBottom.current = true;
      requestAnimationFrame(() => scrollToBottom(true));
    } catch (err) {
      setActionError(friendlyError(err));
    } finally {
      setSending(false);
    }
  };

  const onComposerKey = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter" || event.shiftKey) return;
    if (event.nativeEvent.isComposing) return;
    event.preventDefault();
    void send();
  };

  const startEdit = (message: DmMessage) => {
    setEditingId(message.id);
    setEditDraft(message.body);
    setActionError(null);
  };

  const saveEdit = async (message: DmMessage) => {
    const text = editDraft.trim();
    if (!text || busyId) return;
    setBusyId(message.id);
    setActionError(null);
    try {
      const updated = await editDmMessage(message.id, text);
      setMessages((prev) => mergeMessages(prev, [updated]));
      setEditingId(null);
      setEditDraft("");
      void refreshDm({ silent: true });
    } catch (err) {
      setActionError(friendlyError(err));
    } finally {
      setBusyId(null);
    }
  };

  // Reactions are optimistic-free on purpose: the server returns the authoritative
  // list, so two devices cannot end up counting differently.
  const toggleReaction = async (message: DmMessage, emoji: string) => {
    const mine = message.reactions.some((r) => r.emoji === emoji && r.mine);
    try {
      const next = mine
        ? await unreactToDmMessage(message.id, emoji)
        : await reactToDmMessage(message.id, emoji);
      setMessages((prev) => mergeMessages(prev, [next]));
    } catch (err) {
      setActionError(friendlyError(err));
    }
  };
  const remove = async (message: DmMessage) => {
    if (busyId) return;
    setBusyId(message.id);
    setActionError(null);
    try {
      await deleteDmMessage(message.id);
      setMessages((prev) =>
        mergeMessages(prev, [{ ...message, body: "", deleted: true, edited: undefined }]),
      );
      void refreshDm({ silent: true });
    } catch (err) {
      setActionError(friendlyError(err));
    } finally {
      setBusyId(null);
    }
  };

  const toggleMute = async () => {
    const next = !muted;
    setMuted(next);
    setActionError(null);
    try {
      await setDmMuted(conversationId, next);
      void refreshDm({ silent: true });
    } catch (err) {
      setMuted(!next);
      setActionError(friendlyError(err));
    }
  };

  const hide = async () => {
    setActionError(null);
    try {
      await hideDmConversation(conversationId);
      onBack();
    } catch (err) {
      setActionError(friendlyError(err));
    }
  };

  const other = conv?.other ?? null;
  const name = other?.displayName ?? t("Conversation");
  const presence = other?.presence ?? "offline";

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-1.5 border-b border-edge-soft px-2 py-2">
        <button
          type="button"
          onClick={onBack}
          aria-label={t("Back to conversations")}
          title={t("Back to conversations")}
          className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-ink-muted transition-colors hover:bg-elevated hover:text-ink"
        >
          <ArrowLeft size={17} aria-hidden />
        </button>
        <DmAvatar user={other} size="sm" showPresence />
        <div className="min-w-0 flex-1">
          {other?.handle ? (
            <UserHoverCard handle={other.handle} presence={presence}>
              <button
                type="button"
                onClick={() => {
                  requestOpenProfile(other.handle);
                  onClose();
                }}
                aria-label={t("Open profile")}
                className="block max-w-full truncate text-start text-[13.5px] font-semibold text-ink hover:underline"
              >
                {name}
              </button>
            </UserHoverCard>
          ) : (
            <p className="truncate text-[13.5px] font-semibold text-ink">{name}</p>
          )}
          <p className="flex items-center gap-1 truncate text-[11px] text-ink-subtle">
            <span
              className={`h-1.5 w-1.5 shrink-0 rounded-full ${PRESENCE_META[presence].dot}`}
              aria-hidden
            />
            {presenceStatusLabel(presence)}
            {other?.handle ? <span className="truncate">@{other.handle}</span> : null}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void toggleMute()}
          aria-label={muted ? t("Unmute conversation") : t("Mute conversation")}
          title={muted ? t("Unmute conversation") : t("Mute conversation")}
          aria-pressed={muted}
          className={`grid h-8 w-8 shrink-0 place-items-center rounded-full transition-colors hover:bg-elevated ${
            muted ? "text-accent" : "text-ink-muted hover:text-ink"
          }`}
        >
          {muted ? <BellOff size={15} aria-hidden /> : <Bell size={15} aria-hidden />}
        </button>
        <button
          type="button"
          onClick={() => void hide()}
          aria-label={t("Hide conversation from inbox")}
          title={t("Hide conversation from inbox")}
          className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-ink-muted transition-colors hover:bg-elevated hover:text-danger"
        >
          <Archive size={15} aria-hidden />
        </button>
      </div>

      {actionError && (
        <p
          className="mx-3 mt-2 rounded-md bg-danger/10 px-3 py-1.5 text-[11.5px] text-danger"
          role="alert"
        >
          {actionError}
        </p>
      )}

      <div
        ref={listRef}
        onScroll={onScroll}
        className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto px-3 py-3"
        aria-live="polite"
      >
        {loading ? (
          <div className="grid h-full place-items-center text-ink-subtle">
            <Loader2 size={20} className="animate-spin" aria-hidden />
          </div>
        ) : error ? (
          <div className="grid h-full place-items-center text-center">
            <div>
              <p className="text-[12.5px] text-ink-muted">{error}</p>
              <button
                type="button"
                onClick={onBack}
                title={t("Back to conversations")}
                className="mt-3 rounded-full bg-elevated px-3 py-1.5 text-[12px] font-semibold text-ink ring-1 ring-edge-soft"
              >
                {t("Back to conversations")}
              </button>
            </div>
          </div>
        ) : ordered.length === 0 ? (
          <div className="grid h-full place-items-center text-center">
            <div className="max-w-[220px]">
              <p className="text-[13px] font-semibold text-ink">{t("No messages yet")}</p>
              <p className="mt-1 text-[12px] leading-relaxed text-ink-subtle">
                {t("Say hello. Messages here are private between the two of you.")}
              </p>
            </div>
          </div>
        ) : (
          <>
            {nextCursor && (
              <div className="mb-3 flex justify-center">
                <button
                  type="button"
                  onClick={() => void loadOlder()}
                  disabled={olderLoading}
                  title={t("Load older messages")}
                  className="inline-flex items-center gap-1.5 rounded-full bg-elevated px-3 py-1.5 text-[11.5px] font-medium text-ink-muted ring-1 ring-edge-soft hover:text-ink disabled:opacity-60"
                >
                  {olderLoading && <Loader2 size={12} className="animate-spin" aria-hidden />}
                  {t("Load older messages")}
                </button>
              </div>
            )}
            {ordered.map((message, index) => {
              const prev = ordered[index - 1];
              const showDay = dmDay(prev?.at) !== dmDay(message.at);
              const mine = message.mine;
              const editing = editingId === message.id;
              return (
                <div key={message.id}>
                  {showDay && (
                    <div className="my-3 flex items-center gap-2">
                      <span className="h-px flex-1 bg-edge-soft" aria-hidden />
                      <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-subtle">
                        {dmDay(message.at)}
                      </span>
                      <span className="h-px flex-1 bg-edge-soft" aria-hidden />
                    </div>
                  )}
                  <div
                    className={`group mb-1.5 flex items-end gap-1.5 ${mine ? "justify-end" : "justify-start"}`}
                  >
                    {!mine && (
                      <DmAvatar
                        user={{
                          displayName: message.sender?.displayName ?? name,
                          avatarUrl: message.sender?.avatarUrl,
                          presence,
                        }}
                        size="sm"
                      />
                    )}
                    <div
                      className={`flex min-w-0 max-w-[80%] flex-col ${mine ? "items-end" : "items-start"}`}
                    >
                      <div
                        className={`rounded-2xl px-3 py-2 text-[13px] leading-relaxed ${
                          mine
                            ? "rounded-be-2xl bg-accent text-canvas"
                            : "rounded-bs-2xl bg-elevated text-ink ring-1 ring-edge-soft"
                        }`}
                      >
                        {editing ? (
                          <div className="w-full min-w-0">
                            <textarea
                              autoFocus
                              value={editDraft}
                              maxLength={2000}
                              rows={2}
                              onChange={(e) => setEditDraft(e.target.value)}
                              onKeyDown={(e) => {
                                if (
                                  e.key === "Enter" &&
                                  !e.shiftKey &&
                                  !e.nativeEvent.isComposing
                                ) {
                                  e.preventDefault();
                                  void saveEdit(message);
                                }
                                if (e.key === "Escape") {
                                  e.stopPropagation();
                                  setEditingId(null);
                                }
                              }}
                              className="w-full resize-none rounded-md bg-canvas/20 px-2 py-1 text-[12.5px] text-inherit outline-none ring-1 ring-current/20 placeholder:text-current/60"
                            />
                            <div className="mt-1.5 flex justify-end gap-1">
                              <button
                                type="button"
                                onClick={() => setEditingId(null)}
                                className="grid h-6 w-6 place-items-center rounded-full hover:bg-current/10"
                                aria-label={t("Cancel edit")}
                                title={t("Cancel edit")}
                              >
                                <X size={13} aria-hidden />
                              </button>
                              <button
                                type="button"
                                onClick={() => void saveEdit(message)}
                                disabled={!editDraft.trim() || busyId === message.id}
                                className="grid h-6 w-6 place-items-center rounded-full hover:bg-current/10 disabled:opacity-50"
                                aria-label={t("Save edit")}
                                title={t("Save edit")}
                              >
                                {busyId === message.id ? (
                                  <Loader2 size={13} className="animate-spin" aria-hidden />
                                ) : (
                                  <Check size={13} aria-hidden />
                                )}
                              </button>
                            </div>
                          </div>
                        ) : message.deleted ? (
                          <span className="italic opacity-70">{t("Message deleted")}</span>
                        ) : (
                          <>
                            {message.share && <ShareCard share={message.share} />}
                            {message.body && (
                              <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">
                                {message.body}
                              </p>
                            )}
                          </>
                        )}
                      </div>
                      {message.reactions.length > 0 && (
                        <div
                          className={`mt-1 flex flex-wrap items-center gap-1 ${mine ? "justify-end" : ""}`}
                        >
                          {message.reactions.map((r) => (
                            <button
                              key={r.emoji}
                              type="button"
                              onClick={() => void toggleReaction(message, r.emoji)}
                              aria-pressed={r.mine}
                              aria-label={t("React with {emoji}", { emoji: r.emoji })}
                              title={
                                r.mine
                                  ? t("Remove {emoji} reaction", { emoji: r.emoji })
                                  : t("React with {emoji}", { emoji: r.emoji })
                              }
                              className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[12px] tabular-nums transition-colors ${
                                r.mine
                                  ? "bg-elevated text-ink ring-1 ring-accent/50"
                                  : "bg-elevated text-ink hover:bg-raised ring-1 ring-edge-soft"
                              }`}
                            >
                              <span aria-hidden>{r.emoji}</span>
                              {r.count > 1 ? r.count : ""}
                            </button>
                          ))}
                        </div>
                      )}
                      <div
                        className={`mt-0.5 flex flex-wrap items-center gap-1.5 text-[10px] text-ink-subtle ${mine ? "flex-row-reverse" : ""}`}
                      >
                        <span className="tabular-nums">{dmClock(message.at)}</span>
                        {message.edited && !message.deleted && <span>{t("edited")}</span>}
                        {!message.deleted && !editing && (
                          <span className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                            {mine && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => startEdit(message)}
                                  className="grid h-5 w-5 place-items-center rounded-full hover:bg-elevated hover:text-ink"
                                  aria-label={t("Edit message")}
                                  title={t("Edit message")}
                                >
                                  <Pencil size={11} aria-hidden />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void remove(message)}
                                  disabled={busyId === message.id}
                                  className="grid h-5 w-5 place-items-center rounded-full hover:bg-elevated hover:text-danger disabled:opacity-50"
                                  aria-label={t("Delete message")}
                                  title={t("Delete message")}
                                >
                                  {busyId === message.id ? (
                                    <Loader2 size={11} className="animate-spin" aria-hidden />
                                  ) : (
                                    <Trash2 size={11} aria-hidden />
                                  )}
                                </button>
                              </>
                            )}
                            <DmReactionPicker
                              onPick={(emoji) => void toggleReaction(message, emoji)}
                            />
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
            {seen && (
              <p className="mb-1 text-end text-[10px] text-ink-subtle">
                {t("Seen")} {dmClock(conv?.otherReadAt)}
              </p>
            )}
          </>
        )}
      </div>

      <div className="shrink-0 border-t border-edge-soft p-2">
        <div className="flex items-end gap-1.5">
          <textarea
            ref={textRef}
            value={draft}
            rows={1}
            maxLength={2000}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onComposerKey}
            placeholder={t("Message {name}", { name })}
            aria-label={t("Message {name}", { name })}
            className="max-h-32 min-h-9 min-w-0 flex-1 resize-none rounded-2xl bg-elevated px-3 py-2 text-[13px] text-ink outline-none ring-1 ring-edge-soft placeholder:text-ink-subtle focus:ring-edge"
          />
          <button
            type="button"
            onClick={() => void send()}
            disabled={!draft.trim() || sending}
            aria-label={t("Send message")}
            title={t("Send message")}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-accent text-canvas transition-opacity disabled:opacity-40"
          >
            {sending ? (
              <Loader2 size={16} className="animate-spin" aria-hidden />
            ) : (
              <Send size={15} aria-hidden />
            )}
          </button>
        </div>
        {draft.length > 1800 && (
          <p className="mt-1 text-end text-[10px] tabular-nums text-ink-subtle">
            {draft.length}/2000
          </p>
        )}
      </div>
    </div>
  );
}
