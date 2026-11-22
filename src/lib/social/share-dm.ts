import type { DmShare } from "./dm";

// "Send to a friend" is a navigation-shaped action: the surface that offers it is a title,
// a profile, a group. Rather than thread a callback through every one of them, the request
// goes through this store and one host at the app root renders the picker.
const listeners = new Set<(share: DmShare) => void>();

let pending: DmShare | null = null;

export function requestShareToDm(share: DmShare): void {
  if (!share || !share.id) return;
  if (!listeners.size) {
    // Nothing mounted yet (or the app is in a state where the host is absent): keep the
    // request so it is not silently dropped.
    pending = share;
    return;
  }
  for (const fn of listeners) fn(share);
}

export function subscribeShareToDm(fn: (share: DmShare) => void): () => void {
  listeners.add(fn);
  const queued = pending;
  pending = null;
  if (queued) fn(queued);
  return () => {
    listeners.delete(fn);
  };
}
