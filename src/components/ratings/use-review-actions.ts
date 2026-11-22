import { useCallback, useRef, useState } from "react";
import { findAuthorReviewId } from "@/lib/social/quick-reviews";
import { useReviewEngagement } from "@/lib/social/review-engagement";
import type { TitleRef } from "@/lib/social/review-rank";
import { likeReview, unlikeReview } from "@/lib/social/review-reactions";
import { captureSessionScope } from "@/lib/theme-auth";

type ReviewActionsInput = {
  handle: string;
  target: TitleRef;
  reviewId?: string;
  initialLike?: { count: number; mine: boolean };
  initialCommentCount?: number;
};

export function useReviewActions({
  handle,
  target,
  reviewId,
  initialLike,
  initialCommentCount,
}: ReviewActionsInput) {
  const [resolvedId, setResolvedId] = useState<string>();
  const resolving = useRef<Promise<string | undefined> | null>(null);
  const id = reviewId ?? resolvedId;
  const { value, update } = useReviewEngagement(id);
  const onCommentCount = useCallback((count: number) => update({ comments: count }), [update]);
  const like = value.like ?? initialLike ?? { count: 0, mine: false };
  const commentCount = value.comments ?? initialCommentCount;
  const [liking, setLiking] = useState(false);
  const [likeError, setLikeError] = useState<"auth" | "request" | null>(null);
  const [threadOpen, setThreadOpen] = useState(false);
  const [openingThread, setOpeningThread] = useState(false);

  async function resolveId() {
    if (id) return id;
    resolving.current ??= findAuthorReviewId(handle, target)
      .then((next) => {
        if (next) setResolvedId(next);
        return next;
      })
      .finally(() => {
        resolving.current = null;
      });
    return resolving.current;
  }

  async function toggleLike() {
    if (liking) return;
    const isCurrent = captureSessionScope();
    setLiking(true);
    setLikeError(null);
    try {
      const canonicalId = await resolveId();
      if (!isCurrent()) return;
      if (!canonicalId) {
        setLikeError("request");
        return;
      }
      const result = await (like.mine ? unlikeReview(canonicalId) : likeReview(canonicalId));
      update({ like: { count: result.count, mine: result.reacted } }, canonicalId);
    } catch (error) {
      setLikeError((error as { status?: number }).status === 401 ? "auth" : "request");
    } finally {
      setLiking(false);
    }
  }

  async function toggleComments() {
    if (openingThread) return;
    if (threadOpen) {
      setThreadOpen(false);
      return;
    }
    if (!id) {
      setOpeningThread(true);
      try {
        await resolveId();
      } catch {
        // A missing review hub leaves browsing available while the discussion reports the error.
      } finally {
        setOpeningThread(false);
      }
    }
    setThreadOpen(true);
  }

  return {
    id,
    like,
    commentCount,
    liking,
    likeError,
    threadOpen,
    openingThread,
    toggleLike,
    toggleComments,
    onCommentCount,
  };
}
