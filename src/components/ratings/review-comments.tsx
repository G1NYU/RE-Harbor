import { useEffect, useMemo, useState } from "react";
import { Loader2, Reply } from "lucide-react";
import { useT } from "@/lib/i18n";
import { authToken } from "@/lib/theme-auth";
import { parseQuotedBody } from "@/lib/ratings/quote";
import type { Comment } from "@/views/profile/profile-types";
import { CommentCompose } from "@/views/profile/comment-compose";
import { Avatar, timeAgo } from "@/views/profile/profile-bits";
import { UserHoverCard } from "@/views/profile/user-hover-card";
import { requestOpenProfile } from "@/lib/social/open-profile";
import {
  COMMENT_MAX,
  segmentProfanity,
  stripUrls,
  validateComment,
  type ComposeIssue,
} from "@/views/profile/text-safety";
import {
  createReviewComment,
  loadReviewCommentPage,
  type ReviewCommentApiRow,
} from "@/lib/social/review-comment-api";
import { useReviewEngagement } from "@/lib/social/review-engagement";

function fromReviewComment(row: ReviewCommentApiRow): Comment {
  const handle = row.author?.handle || "?";
  return {
    id: row.id,
    parentId: row.parentId || undefined,
    body: row.body,
    at: row.at,
    edited: row.edited,
    authorHandle: handle,
    authorAlias: row.author?.displayName || handle,
    authorAvatarUrl: row.author?.avatarUrl,
    authorVerified: row.author?.verified,
  };
}

type CommentNode = { comment: Comment; replies: CommentNode[] };

function commentTree(comments: Comment[]): CommentNode[] {
  const nodes = new Map(
    comments.map((comment) => [comment.id, { comment, replies: [] as CommentNode[] }]),
  );
  const roots: CommentNode[] = [];
  for (const node of nodes.values()) {
    const parent = node.comment.parentId ? nodes.get(node.comment.parentId) : undefined;
    if (parent && parent.comment.id !== node.comment.id) parent.replies.push(node);
    else roots.push(node);
  }
  return roots;
}

function ReviewCommentNode({
  node,
  signedIn,
  replyingTo,
  sending,
  onReply,
  onSubmit,
}: {
  node: CommentNode;
  signedIn: boolean;
  replyingTo: string | null;
  sending: boolean;
  onReply: (id: string | null) => void;
  onSubmit: (text: string, parentId: string) => Promise<ComposeIssue>;
}) {
  const t = useT();
  const { comment } = node;
  const body = parseQuotedBody(comment.body).text;
  return (
    <li className="flex flex-col gap-2">
      <div className="flex items-start gap-2">
        <UserHoverCard handle={comment.authorHandle}>
          <button
            type="button"
            onClick={() => requestOpenProfile(comment.authorHandle)}
            aria-label={t("Open {alias} profile", {
              alias: comment.authorAlias || comment.authorHandle,
            })}
            className="shrink-0 rounded-full"
          >
            <Avatar
              src={comment.authorAvatarUrl}
              size={24}
              alias={comment.authorAlias || comment.authorHandle}
            />
          </button>
        </UserHoverCard>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <UserHoverCard handle={comment.authorHandle}>
              <button
                type="button"
                onClick={() => requestOpenProfile(comment.authorHandle)}
                className="truncate text-[12px] font-semibold text-ink hover:text-accent"
              >
                {comment.authorAlias || `@${comment.authorHandle}`}
              </button>
            </UserHoverCard>
            <span className="text-[11.5px] text-ink-subtle">{timeAgo(comment.at)}</span>
          </div>
          <Body text={body} />
          {signedIn && (
            <button
              type="button"
              onClick={() => onReply(replyingTo === comment.id ? null : comment.id)}
              aria-expanded={replyingTo === comment.id}
              className="mt-1 inline-flex h-7 items-center gap-1 rounded-md px-1.5 text-[11.5px] font-medium text-ink-subtle transition-colors hover:bg-elevated/70 hover:text-ink"
            >
              <Reply size={13} /> {replyingTo === comment.id ? t("Cancel") : t("Reply")}
            </button>
          )}
          {replyingTo === comment.id && (
            <div className="mt-1">
              <CommentCompose
                placeholder={t("Leave a comment on this review.")}
                onSubmit={(raw) => onSubmit(raw, comment.id)}
                sending={sending}
                disabled={!signedIn}
                sources={[]}
              />
            </div>
          )}
        </div>
      </div>
      {node.replies.length > 0 && (
        <ul className="ms-3 flex flex-col gap-2 border-s-2 border-edge-soft ps-3">
          {node.replies.map((reply) => (
            <ReviewCommentNode
              key={reply.comment.id}
              node={reply}
              signedIn={signedIn}
              replyingTo={replyingTo}
              sending={sending}
              onReply={onReply}
              onSubmit={onSubmit}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

function Body({ text }: { text: string }) {
  const t = useT();
  return (
    <p className="mt-0.5 whitespace-pre-wrap break-words text-[12.5px] leading-relaxed text-ink-muted">
      {segmentProfanity(text).map((segment, index) =>
        segment.masked ? (
          <span
            key={index}
            title={t("Hidden language")}
            className="cursor-default rounded-[4px] bg-elevated px-1 blur-[5px] transition-[filter] duration-150 hover:blur-0"
          >
            {segment.text}
          </span>
        ) : (
          <span key={index}>{segment.text}</span>
        ),
      )}
    </p>
  );
}

/**
 * The discussion under one review. Replies are stored as profile comments that quote the rated
 * title, so this thread and the reviewer's profile show the same conversation.
 */
export function ReviewDiscussion({
  reviewId,
  onCount,
}: {
  reviewId?: string;
  onCount?: (count: number) => void;
}) {
  const t = useT();
  if (!reviewId) {
    return (
      <p role="status" className="py-2 text-[12px] text-ink-muted">
        {t("Review comments are unavailable.")}
      </p>
    );
  }
  return <ReviewComments key={reviewId} reviewId={reviewId} onCount={onCount} />;
}

export function ReviewComments({
  onCount,
  reviewId,
}: {
  onCount?: (count: number) => void;
  reviewId: string;
}) {
  const t = useT();
  const signedIn = !!authToken();
  const { value: engagement, update } = useReviewEngagement(reviewId);
  const threadVersion = engagement.threadVersion ?? 0;
  const [state, setState] = useState<"loading" | "ready" | "empty" | "error">("loading");
  const [comments, setComments] = useState<Comment[]>([]);
  const [nextCursor, setNextCursor] = useState<string | undefined>();
  const [serverCount, setServerCount] = useState<number | null>(null);
  const [sending, setSending] = useState(false);
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState("");
  const roots = useMemo(() => commentTree(comments), [comments]);

  useEffect(() => {
    let live = true;
    setState("loading");
    loadReviewCommentPage(reviewId)
      .then((page) => {
        if (!live) return;
        const rows = (page.comments ?? []).map(fromReviewComment);
        setComments(rows);
        setNextCursor(page.nextCursor);
        setServerCount(page.total);
        setState(rows.length ? "ready" : "empty");
      })
      .catch(() => {
        if (live) setState("error");
      });
    return () => {
      live = false;
    };
  }, [reviewId, threadVersion]);

  useEffect(() => {
    if (state === "ready" || state === "empty") onCount?.(serverCount ?? comments.length);
  }, [comments.length, onCount, serverCount, state]);

  const more = async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    setLoadError("");
    try {
      const page = await loadReviewCommentPage(reviewId, nextCursor);
      setComments((cur) => [...cur, ...(page.comments ?? []).map(fromReviewComment)]);
      setNextCursor(page.nextCursor);
    } catch {
      setLoadError(t("Could not load more comments."));
    } finally {
      setLoadingMore(false);
    }
  };

  const submit = async (raw: string, parentId?: string): Promise<ComposeIssue> => {
    if (!signedIn) return "signin";
    const issue = validateComment(raw, 0, Date.now(), COMMENT_MAX);
    if (issue) return issue;
    setSending(true);
    try {
      const body = stripUrls(raw.trim());
      const created = fromReviewComment(await createReviewComment(reviewId, body, parentId));
      setComments((cur) => [created, ...cur]);
      setReplyingTo(null);
      const count = (serverCount ?? comments.length) + 1;
      setServerCount(count);
      update({ comments: count, threadChanged: true });
      setState("ready");
      return null;
    } catch (error) {
      return (error as { status?: number }).status === 429 ? "cooldown" : "failed";
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="mt-2 border-t border-edge-soft pt-2">
      {state === "loading" && (
        <p className="flex items-center gap-1.5 py-2 text-[12px] text-ink-subtle">
          <Loader2 size={12} className="animate-spin" />
          {t("Loading comments…")}
        </p>
      )}

      {state === "error" && (
        <p className="py-2 text-[12px] text-ink-subtle">{t("Could not load comments")}</p>
      )}

      {state === "empty" && (
        <p className="py-2 text-[12px] text-ink-subtle">{t("No comments yet on this review.")}</p>
      )}

      {comments.length > 0 && (
        <ul className="flex flex-col gap-2">
          {roots.map((node) => (
            <ReviewCommentNode
              key={node.comment.id}
              node={node}
              signedIn={signedIn}
              replyingTo={replyingTo}
              sending={sending}
              onReply={setReplyingTo}
              onSubmit={submit}
            />
          ))}
        </ul>
      )}

      {nextCursor && (
        <button
          type="button"
          onClick={() => void more()}
          disabled={loadingMore}
          className="mt-2 inline-flex h-8 items-center gap-1.5 rounded-full px-2 text-[12px] font-medium text-ink-subtle transition-colors hover:text-ink disabled:opacity-50"
        >
          {loadingMore && <Loader2 size={12} className="animate-spin" />}
          {t("Show more comments")}
        </button>
      )}

      {loadError && <p className="mt-1 text-[12px] text-danger">{loadError}</p>}

      <div className="mt-2">
        <CommentCompose
          placeholder={t("Leave a comment on this review.")}
          onSubmit={submit}
          sending={sending}
          disabled={!signedIn}
          sources={[]}
        />
      </div>
    </div>
  );
}
