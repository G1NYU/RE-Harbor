import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { currentAuthor, subscribeAuthor } from "@/lib/theme-auth";
import { acceptFriend, declineFriend, fetchPendingRequests, type PendingRequest } from "./friends";
import { fetchAllNotifications, markAllNotificationsRead, type CenterNotif } from "./notifications";
import { dismissNotifs, isDismissed, subscribeDismissed } from "./dismissed-notifications";
import { setUnreadCount } from "./unread-bridge";
import { useProfiles } from "@/lib/profiles";
import { useT } from "@/lib/i18n";
import { useSourceAlerts } from "@/hooks/use-source-alerts";
import { markSourceAlertsRead } from "@/lib/games/source-alerts";
import {
  bellNotificationEnabled,
  hydrateBellPreferences,
  useBellPreferences,
} from "./notification-preferences";

const POLL_MS = 60000;

export function useNotificationCenter() {
  const { activeId } = useProfiles(),
    profile = activeId ?? "default",
    t = useT();
  const alerts = useSourceAlerts(profile);
  const author = useSyncExternalStore(subscribeAuthor, currentAuthor, currentAuthor);
  const authed = !!author;
  const preferences = useBellPreferences();
  const [items, setItems] = useState<CenterNotif[]>([]);
  const [pending, setPending] = useState<PendingRequest[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(false);
  const acRef = useRef<AbortController | null>(null);

  const [, setDismTick] = useState(0);

  useEffect(() => subscribeDismissed(() => setDismTick((t) => t + 1)), []);

  const refresh = useCallback(async () => {
    if (!currentAuthor()) {
      setItems([]);
      setPending([]);
      setUnread(0);
      return;
    }
    acRef.current?.abort();
    const ac = new AbortController();
    acRef.current = ac;
    setLoading(true);
    try {
      const [feed, reqs] = await Promise.all([
        fetchAllNotifications(ac.signal),
        fetchPendingRequests(ac.signal).catch(() => [] as PendingRequest[]),
      ]);
      if (ac.signal.aborted) return;
      setItems(feed.items);
      setUnread(feed.unread);
      setPending(reqs);
    } finally {
      if (!ac.signal.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    setItems([]);
    setPending([]);
    setUnread(0);
    setLoading(false);
    if (!authed) {
      setItems([]);
      setPending([]);
      setUnread(0);
      return;
    }
    let disposed = false;
    void hydrateBellPreferences().then(() => {
      if (!disposed) void refresh();
    });
    const id = window.setInterval(() => {
      if (document.hidden) return;
      void refresh();
    }, POLL_MS);
    const onVis = () => {
      if (!document.hidden) void refresh();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      disposed = true;
      acRef.current?.abort();
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [authed, author?.id, profile, refresh]);

  const markRead = useCallback(async () => {
    try {
      if (preferences.game_sources) markSourceAlertsRead(profile);
    } catch {
      /* Keep unread local notices if storage cannot commit. */
    }
    if (!unread) return;
    setItems((prev) => prev.map((n) => ({ ...n, read: true })));
    setUnread(0);
    await markAllNotificationsRead();
  }, [unread, profile, preferences.game_sources]);

  const accept = useCallback(
    async (edgeId: string) => {
      setPending((prev) => prev.filter((p) => p.edgeId !== edgeId));
      await acceptFriend(edgeId).catch(() => {});
      void refresh();
    },
    [refresh],
  );

  const decline = useCallback(
    async (edgeId: string) => {
      setPending((prev) => prev.filter((p) => p.edgeId !== edgeId));
      await declineFriend(edgeId).catch(() => {});
      void refresh();
    },
    [refresh],
  );

  const dismiss = useCallback((id: string) => dismissNotifs([id]), []);

  const clearAll = useCallback(async () => {
    dismissNotifs([...items.map((n) => n.id), ...alerts.notices.map((notice) => notice.id)]);
    await markRead();
  }, [items, alerts.notices, markRead]);

  const localItems: CenterNotif[] = alerts.notices.map((notice) => ({
    id: notice.id,
    source: "game",
    kind: "game-source-available",
    title: t("games.sourceAlerts.noticeTitle", { name: notice.game.name }),
    body: t("games.sourceAlerts.noticeBody", {
      source: notice.sourceName,
      title: notice.releaseTitle,
    }),
    cover: notice.game.adultContent ? undefined : notice.game.capsule,
    createdAt: notice.createdAt,
    read: notice.read,
    data: { profile, game: notice.game },
  }));
  const visibleItems = [...items, ...localItems]
    .filter(
      (n) =>
        !isDismissed(n.id) &&
        n.kind !== "friend-request" &&
        bellNotificationEnabled(n, preferences),
    )
    .sort((a, b) => b.createdAt - a.createdAt);
  const unreadCount = visibleItems.filter((n) => !n.read).length;
  const visiblePending = preferences.friend_requests ? pending : [];
  const badge = unreadCount + visiblePending.length;

  useEffect(() => setUnreadCount(badge), [badge]);

  return {
    authed,
    accountId: author?.id,
    profile,
    hasLocal: alerts.watches.length > 0 || alerts.notices.length > 0,
    items: visibleItems,
    pending: visiblePending,
    unread: unreadCount,
    badge,
    loading,
    refresh,
    markRead,
    accept,
    decline,
    dismiss,
    clearAll,
  };
}
