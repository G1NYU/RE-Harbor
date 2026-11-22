import { useEffect, useState, useSyncExternalStore, type RefObject } from "react";
import { captureSessionScope, currentAuthor, subscribeAuthor } from "@/lib/theme-auth";
import { observeWithin } from "@/lib/visibility";
import { fetchSummary } from "@/views/profile/profile-api";
import type { ProfileSummary } from "@/views/profile/profile-types";

const TTL = 30_000;
const cache = new Map<string, { summary: ProfileSummary; at: number }>();
const inflight = new Map<string, Promise<ProfileSummary>>();
const listeners = new Set<() => void>();
let active = 0;
const waiters: Array<() => void> = [];
const keyFor = (handle: string) => `${currentAuthor()?.id ?? "anon"}:${handle.toLowerCase()}`;
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export function publishProfileCardSummary(summary: ProfileSummary): void {
  cache.set(keyFor(summary.handle), { summary, at: Date.now() });
  for (const listener of listeners) listener();
}

export function updateProfileCardFriendStatus(
  handle: string,
  friendStatus: ProfileSummary["friendStatus"],
): void {
  const entry = cache.get(keyFor(handle));
  if (entry) publishProfileCardSummary({ ...entry.summary, friendStatus });
}

/** Visible discovery cards and hover previews share one bounded profile-summary loader. */
export function loadProfileCardSummary(handle: string): Promise<ProfileSummary> {
  const key = keyFor(handle);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return Promise.resolve(hit.summary);
  const pending = inflight.get(key);
  if (pending) return pending;
  const isCurrent = captureSessionScope();
  const task = (async () => {
    if (active >= 4) await new Promise<void>((resolve) => waiters.push(resolve));
    else active++;
    try {
      if (!isCurrent()) throw new Error("Account changed");
      const summary = await fetchSummary(handle);
      if (!isCurrent()) throw new Error("Account changed");
      publishProfileCardSummary(summary);
      return summary;
    } finally {
      const next = waiters.shift();
      if (next) next();
      else active--;
    }
  })().finally(() => {
    if (inflight.get(key) === task) inflight.delete(key);
  });
  for (const [oldKey, entry] of cache) {
    if (Date.now() - entry.at > TTL * 10) cache.delete(oldKey);
  }
  inflight.set(key, task);
  return task;
}

export function useProfileCardSummary(
  handle: string,
  ref: RefObject<Element | null>,
): { summary: ProfileSummary | undefined; failed: boolean } {
  useSyncExternalStore(subscribeAuthor, currentAuthor, currentAuthor);
  const key = keyFor(handle);
  const summary = useSyncExternalStore(
    subscribe,
    () => cache.get(key)?.summary,
    () => undefined,
  );
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    let visible = false;
    let disposed = false;
    setFailed(false);
    const refresh = () => {
      if (visible && !document.hidden)
        void loadProfileCardSummary(handle).then(
          () => {
            if (!disposed) setFailed(false);
          },
          () => {
            if (!disposed) setFailed(true);
          },
        );
    };
    const stop = observeWithin(
      element,
      "0px",
      (entry) => {
        visible = entry.isIntersecting;
        refresh();
      },
      null,
    );
    const timer = window.setInterval(refresh, TTL);
    window.addEventListener("focus", refresh);
    return () => {
      disposed = true;
      stop();
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
    };
  }, [handle, key, ref]);
  return { summary, failed };
}
