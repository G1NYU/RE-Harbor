import { DmUnreadBadge } from "@/components/dm/dm-unread-badge";
import { useMemo, useState } from "react";
import { Search, SquarePen, BellOff } from "lucide-react";
import { useT } from "@/lib/i18n";
import type { DmConversation } from "@/lib/social/dm";
import { dmPreview, dmWhen } from "@/lib/social/dm-format";
import { DmAvatar } from "./dm-avatar";

export function DmInbox({
  conversations,
  loading,
  error,
  onOpen,
  onCompose,
  onRetry,
}: {
  conversations: DmConversation[];
  loading: boolean;
  error: string | null;
  onOpen: (id: string) => void;
  onCompose: () => void;
  onRetry: () => void;
}) {
  const t = useT();
  const [query, setQuery] = useState("");
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return conversations;
    return conversations.filter((c) => {
      const name = `${c.other?.displayName ?? ""} ${c.other?.handle ?? ""}`.toLowerCase();
      return name.includes(q);
    });
  }, [conversations, query]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 px-3 pb-2">
        <label className="flex h-9 items-center gap-2 rounded-full bg-elevated px-3 text-ink-subtle ring-1 ring-edge-soft focus-within:ring-edge">
          <Search size={15} aria-hidden />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("Search messages")}
            className="min-w-0 flex-1 bg-transparent text-[13px] text-ink outline-none placeholder:text-ink-subtle"
          />
        </label>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {error ? (
          <div className="m-2 rounded-lg bg-elevated px-3 py-3 text-[12.5px] text-ink-muted ring-1 ring-edge-soft">
            <p>{error}</p>
            <button
              type="button"
              onClick={onRetry}
              title={t("Try again")}
              className="mt-2 rounded-md bg-surface px-2.5 py-1 text-[12px] font-semibold text-ink ring-1 ring-edge-soft hover:bg-elevated"
            >
              {t("Try again")}
            </button>
          </div>
        ) : loading && conversations.length === 0 ? (
          <div className="space-y-2 p-2" aria-hidden>
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex items-center gap-3 rounded-lg px-2 py-2">
                <span className="h-10 w-10 rounded-full bg-elevated" />
                <span className="flex-1 space-y-1.5">
                  <span className="block h-3 w-1/3 rounded bg-elevated" />
                  <span className="block h-2.5 w-2/3 rounded bg-elevated" />
                </span>
              </div>
            ))}
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
            <span className="grid h-12 w-12 place-items-center rounded-full bg-elevated text-ink-subtle">
              <BellOff size={20} aria-hidden />
            </span>
            <div>
              <p className="text-[13.5px] font-semibold text-ink">
                {query.trim() ? t("No conversations match that search") : t("No messages yet")}
              </p>
              <p className="mt-1 text-[12.5px] leading-relaxed text-ink-subtle">
                {query.trim()
                  ? t("Try another name or handle.")
                  : t("Start a private conversation with someone on Harbor.")}
              </p>
            </div>
            {!query.trim() && (
              <button
                type="button"
                onClick={onCompose}
                title={t("New message")}
                className="inline-flex items-center gap-1.5 rounded-full bg-accent px-3.5 py-1.5 text-[12.5px] font-semibold text-canvas"
              >
                <SquarePen size={14} aria-hidden />
                {t("New message")}
              </button>
            )}
          </div>
        ) : (
          <ul className="space-y-0.5">
            {rows.map((c) => {
              const other = c.other;
              const name = other?.displayName ?? t("Unknown user");
              const preview = c.lastMessage?.deleted
                ? t("Message deleted")
                : dmPreview(c.lastMessage?.body, t("No messages yet"));
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => onOpen(c.id)}
                    title={t("Open conversation")}
                    className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-start transition-colors hover:bg-elevated focus-visible:outline-2 focus-visible:outline-accent"
                  >
                    <DmAvatar user={other} showPresence />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline gap-2">
                        <span
                          className={`min-w-0 flex-1 truncate text-[13.5px] ${c.unread > 0 ? "font-semibold text-ink" : "font-medium text-ink"}`}
                        >
                          {name}
                        </span>
                        <span className="shrink-0 text-[10.5px] tabular-nums text-ink-subtle">
                          {dmWhen(c.lastMessage?.at ?? c.at)}
                        </span>
                      </span>
                      <span className="mt-0.5 flex items-center gap-1.5">
                        {c.muted && (
                          <BellOff
                            size={12}
                            className="shrink-0 text-ink-subtle"
                            aria-label={t("Muted")}
                          />
                        )}
                        <span
                          className={`min-w-0 flex-1 truncate text-[12px] ${c.unread > 0 ? "text-ink-muted" : "text-ink-subtle"}`}
                        >
                          {c.lastMessage?.mine && !c.lastMessage.deleted ? `${t("You")}: ` : ""}
                          {preview}
                        </span>
                        {c.unread > 0 && <DmUnreadBadge count={c.unread} />}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
