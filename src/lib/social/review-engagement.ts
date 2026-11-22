import { useCallback, useSyncExternalStore } from "react";
import { currentAuthor } from "@/lib/theme-auth";

type Engagement = {
  like?: { count: number; mine: boolean };
  comments?: number;
  threadChanged?: boolean;
};
type Snapshot = Omit<Engagement, "threadChanged"> & { threadVersion?: number };
const cache = new Map<string, Snapshot>();
const listeners = new Set<() => void>();
const empty: Snapshot = {};

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useReviewEngagement(id?: string) {
  const viewer = currentAuthor()?.handle;
  const key = id ? JSON.stringify([viewer, id]) : undefined;
  const value = useSyncExternalStore(subscribe, () => (key && cache.get(key)) || empty);
  const update = useCallback(
    ({ threadChanged, ...patch }: Engagement, reviewId = id) => {
      if (!reviewId) return;
      const updateKey = JSON.stringify([viewer, reviewId]);
      const previous = cache.get(updateKey);
      if (
        patch.comments !== undefined &&
        previous?.comments === patch.comments &&
        !patch.like &&
        !threadChanged
      )
        return;
      cache.set(updateKey, {
        ...previous,
        ...patch,
        threadVersion: (previous?.threadVersion ?? 0) + Number(!!threadChanged),
      });
      for (const listener of listeners) listener();
    },
    [id, viewer],
  );
  return { value, update };
}
