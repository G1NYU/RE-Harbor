import { socialGet, socialPost } from "@/lib/social/client";

export type ReviewCommentApiRow = {
  id: string;
  parentId?: string | null;
  body: string;
  at: string;
  edited?: boolean;
  author?: { handle?: string; displayName?: string; avatarUrl?: string; verified?: boolean };
};

export type ReviewCommentPage = {
  comments: ReviewCommentApiRow[];
  nextCursor?: string;
  total: number;
};

export function loadReviewCommentPage(
  reviewId: string,
  cursor?: string,
): Promise<ReviewCommentPage> {
  const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
  return socialGet<ReviewCommentPage>(
    `/social/reviews/${encodeURIComponent(reviewId)}/comments${query}`,
  );
}

export function createReviewComment(reviewId: string, body: string, parentId?: string) {
  return socialPost<ReviewCommentApiRow>(
    `/social/reviews/${encodeURIComponent(reviewId)}/comments`,
    { body, ...(parentId ? { parentId } : {}) },
  );
}
