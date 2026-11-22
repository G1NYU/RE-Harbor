import { useSyncExternalStore } from "react";
import { captureSessionScope, currentAuthor, subscribeAuthor } from "@/lib/theme-auth";
import { activeProfileId } from "@/lib/active-profile-id";
import { socialGet, socialPatch } from "./client";
import type { CenterNotif } from "./notifications";

export const BELL_CATEGORIES = [
  { id: "review_likes", label: "Liked your review", group: "Reviews and profiles" },
  { id: "review_comments", label: "Commented on your review", group: "Reviews and profiles" },
  { id: "profile_comments", label: "Commented on your profile", group: "Reviews and profiles" },
  { id: "mentions", label: "Mentioned you", group: "Reviews and profiles" },
  { id: "friend_requests", label: "Sent you a friend request", group: "Friends and groups" },
  { id: "friend_accepted", label: "Accepted your friend request", group: "Friends and groups" },
  { id: "group_invites", label: "Invited you to a group", group: "Friends and groups" },
  { id: "group_posts", label: "New group posts", group: "Friends and groups" },
  { id: "group_activity", label: "Group activity and role changes", group: "Friends and groups" },
  { id: "watch_party_invites", label: "Watch party invitations", group: "Watch parties" },
  { id: "watch_party_activity", label: "Someone joined your watch party", group: "Watch parties" },
  { id: "theme_comments", label: "Commented on your theme", group: "Themes" },
  { id: "theme_downloads", label: "Theme download milestones", group: "Themes" },
  { id: "theme_ratings", label: "Theme rating milestones", group: "Themes" },
  { id: "badges", label: "Earned a badge", group: "Harbor" },
  { id: "game_sources", label: "Game source availability", group: "Harbor" },
  { id: "diagnostics", label: "Diagnostics requests", group: "Harbor" },
  { id: "system", label: "Messages from Harbor", group: "Harbor" },
  { id: "other", label: "Other notifications", group: "Harbor" },
] as const;
export type BellCategory = (typeof BELL_CATEGORIES)[number]["id"];
export type BellPreferences = Record<BellCategory, boolean>;
const DEFAULTS = Object.fromEntries(BELL_CATEGORIES.map(({ id }) => [id, true])) as BellPreferences;
type Entry = { preferences: BellPreferences; dirty: boolean; version: number };
const entries = new Map<string, Entry>();
const pending = new Map<string, Promise<void>>();
const listeners = new Set<() => void>();
const scope = () => currentAuthor()?.id ?? `guest:${activeProfileId()}`;
const storageKey = (key: string) => `harbor.bell-preferences.v1:${key}`;
const emit = () => {
  for (const listener of listeners) listener();
};
export function normalizeBellPreferences(raw: unknown): BellPreferences {
  const object = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return Object.fromEntries(
    BELL_CATEGORIES.map(({ id }) => [id, object[id] !== false]),
  ) as BellPreferences;
}
function entryFor(key: string): Entry {
  const hit = entries.get(key);
  if (hit) return hit;
  let raw: { preferences?: unknown; dirty?: boolean } = {};
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey(key)) || "{}");
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) raw = parsed;
  } catch {
    /* Defaults apply. */
  }
  const entry = {
    preferences: raw.preferences ? normalizeBellPreferences(raw.preferences) : DEFAULTS,
    dirty: raw.dirty === true,
    version: 0,
  };
  entries.set(key, entry);
  return entry;
}
function commit(key: string, preferences: BellPreferences, dirty: boolean): void {
  const previous = entryFor(key);
  const same = BELL_CATEGORIES.every(({ id }) => previous.preferences[id] === preferences[id]);
  entries.set(key, {
    preferences: same ? previous.preferences : preferences,
    dirty,
    version: previous.version + 1,
  });
  try {
    localStorage.setItem(storageKey(key), JSON.stringify({ preferences, dirty }));
  } catch {
    /* Keep session preference. */
  }
  emit();
}
function missing(error: unknown): boolean {
  const status = (error as { status?: number }).status;
  return status === 404 || status === 405;
}
export function currentBellPreferences(): BellPreferences {
  return entryFor(scope()).preferences;
}
export function useBellPreferences(): BellPreferences {
  useSyncExternalStore(subscribeAuthor, currentAuthor, currentAuthor);
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    currentBellPreferences,
    () => DEFAULTS,
  );
}
export async function hydrateBellPreferences(): Promise<void> {
  if (!currentAuthor()) return;
  const key = scope();
  const existing = pending.get(key);
  if (existing) return existing;
  const current = entryFor(key);
  const version = current.version;
  const isCurrent = captureSessionScope();
  const task = (async () => {
    try {
      const response = current.dirty
        ? await socialPatch<{ preferences: BellPreferences }>(
            "/social/me/notification-preferences",
            { preferences: current.preferences },
          )
        : await socialGet<{ preferences: BellPreferences }>("/social/me/notification-preferences");
      if (isCurrent() && entryFor(key).version === version)
        commit(key, normalizeBellPreferences(response.preferences), false);
    } catch {
      /* Local choices remain effective while account sync is unavailable. */
    }
  })().finally(() => pending.delete(key));
  pending.set(key, task);
  return task;
}
export async function setBellPreference(category: BellCategory, enabled: boolean): Promise<void> {
  const key = scope();
  const next = { ...entryFor(key).preferences, [category]: enabled };
  commit(key, next, true);
  if (!currentAuthor()) return;
  const version = entryFor(key).version;
  const isCurrent = captureSessionScope();
  try {
    const response = await socialPatch<{ preferences: BellPreferences }>(
      "/social/me/notification-preferences",
      { preferences: next },
    );
    if (isCurrent() && entryFor(key).version === version)
      commit(key, normalizeBellPreferences(response.preferences), false);
  } catch (error) {
    if (!missing(error)) throw error;
  }
}
export function bellCategoryFor(
  notification: Pick<CenterNotif, "kind" | "source" | "title">,
): BellCategory {
  if (notification.source === "theme") {
    const map: Record<string, BellCategory> = {
      comment: "theme_comments",
      downloads: "theme_downloads",
      stars: "theme_ratings",
    };
    return map[notification.kind] ?? "other";
  }
  if (notification.kind === "friend-request")
    return notification.title === "Request accepted" ? "friend_accepted" : "friend_requests";
  const map: Record<string, BellCategory> = {
    review_reaction: "review_likes",
    review_comment: "review_comments",
    comment: "profile_comments",
    mention: "mentions",
    "friend-accepted": "friend_accepted",
    "group-added": "group_invites",
    "group-invite": "group_invites",
    "group-post": "group_posts",
    "group-role": "group_activity",
    "group-invite-accepted": "group_activity",
    "badge-received": "badges",
    "badge-earned": "badges",
    watch_party_invite: "watch_party_invites",
    watch_party_join: "watch_party_activity",
    "diagnostics-request": "diagnostics",
    system: "system",
    stremio_rebound: "system",
    "game-source-available": "game_sources",
  };
  return map[notification.kind] ?? "other";
}
export function bellNotificationEnabled(
  notification: Pick<CenterNotif, "kind" | "source" | "title">,
  preferences: BellPreferences,
): boolean {
  return notification.kind !== "direct_message" && preferences[bellCategoryFor(notification)];
}
