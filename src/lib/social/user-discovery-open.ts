const listeners = new Set<() => void>();
export function requestOpenUserDiscovery(): void {
  for (const listener of listeners) listener();
}
export function subscribeUserDiscoveryOpen(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
