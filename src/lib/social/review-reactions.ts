import { socialDelete, socialPost } from "./client";

// Liking a review is the review hub's existing reaction: one per user, idempotent on the
// server, and the response carries the authoritative count so the card never guesses.
export type ReviewReactionResult = { ok: boolean; reacted: boolean; count: number };

export function likeReview(reviewId: string): Promise<ReviewReactionResult> {
  return socialPost<ReviewReactionResult>(
    `/social/reviews/${encodeURIComponent(reviewId)}/reaction`,
    {},
  );
}

export function unlikeReview(reviewId: string): Promise<ReviewReactionResult> {
  return socialDelete<ReviewReactionResult>(
    `/social/reviews/${encodeURIComponent(reviewId)}/reaction`,
  );
}
