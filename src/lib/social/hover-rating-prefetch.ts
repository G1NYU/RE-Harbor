import { useEffect, type RefObject } from "react";
import { inferRatingMediaType } from "@/lib/ratings/types";
import { captureSessionScope } from "@/lib/theme-auth";
import { observeWithin } from "@/lib/visibility";
import { ensureMarksForTitle } from "./friend-review-index";

const queue: Array<() => Promise<void>> = [];
let active = 0;

function drain(): void {
  while (active < 2 && queue.length) {
    const task = queue.shift()!;
    active++;
    void task().finally(() => {
      active--;
      drain();
    });
  }
}

/** Cancellable, bounded background work. Opening a hover card bypasses this queue. */
export function prefetchHoverRatings(mediaType: string, itemKey: string): () => void {
  let cancelled = false;
  const isCurrent = captureSessionScope();
  const task = async () => {
    if (!cancelled && isCurrent() && !document.hidden)
      await ensureMarksForTitle(mediaType, itemKey);
  };
  queue.push(task);
  drain();
  return () => {
    cancelled = true;
    const index = queue.indexOf(task);
    if (index !== -1) queue.splice(index, 1);
  };
}

export function useHoverRatingPrefetch(
  ref: RefObject<Element | null>,
  itemKey: string,
  kind: string,
  enabled: boolean,
): void {
  useEffect(() => {
    const element = ref.current;
    if (!element || !enabled) return;
    let timer: number | undefined;
    let cancel: (() => void) | undefined;
    const stop = () => {
      window.clearTimeout(timer);
      cancel?.();
    };
    const unobserve = observeWithin(
      element,
      "0px",
      (entry) => {
        stop();
        if (!entry.isIntersecting) return;
        timer = window.setTimeout(() => {
          const mediaType = inferRatingMediaType(itemKey, {
            type: kind,
            isAnime: /^(kitsu|mal|anilist|anidb):/i.test(itemKey),
          });
          cancel = prefetchHoverRatings(mediaType, itemKey);
        }, 200);
      },
      null,
    );
    return () => {
      stop();
      unobserve();
    };
  }, [ref, itemKey, kind, enabled]);
}
