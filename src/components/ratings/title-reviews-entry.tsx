import { useEffect, useMemo, useState } from "react";
import { MessageSquare } from "lucide-react";
import { useT } from "@/lib/i18n";
import { authToken } from "@/lib/theme-auth";
import type { RatingTarget } from "@/lib/ratings/types";
import { loadFriendTitleRatings, type TitleRatingsSnapshot } from "@/lib/social/title-reviews";
import { stackHandles } from "@/lib/social/review-rank";
import { Avatar } from "@/views/profile/profile-bits";
import { TitleReviewsPanel } from "./title-reviews-panel";

/**
 * Social reviews entry for the details page action row. It borrows the row's secondary-button
 * surface (`bg-white/[0.06]` pill, 48px tall) so it reads as one of the hero actions, then adds
 * the friend signal when there is one. Signed out viewers have no friends to show, so it renders
 * nothing for them.
 */
export function TitleReviewsEntry({
  target,
  className = "",
}: {
  target: RatingTarget;
  className?: string;
}) {
  const t = useT();
  const signedIn = !!authToken();
  const [open, setOpen] = useState(false);
  const [snapshot, setSnapshot] = useState<TitleRatingsSnapshot | null>(null);
  const ref = useMemo(
    () => ({ itemKey: target.itemKey, mediaType: target.mediaType }),
    [target.itemKey, target.mediaType],
  );

  useEffect(() => {
    if (!signedIn) {
      setSnapshot(null);
      return;
    }
    let live = true;
    loadFriendTitleRatings(ref)
      .then((next) => {
        if (live) setSnapshot(next);
      })
      .catch(() => {
        if (live) setSnapshot({ ratings: [], complete: false, scanned: 0, signedOut: false });
      });
    return () => {
      live = false;
    };
  }, [signedIn, ref]);

  if (!signedIn) return null;

  const ratings = snapshot?.ratings ?? [];
  const handles = stackHandles(ratings, 3);
  const avatars = new Map(ratings.map((rating) => [rating.handle, rating.avatarUrl]));
  const empty = ratings.length === 0;
  const label = empty
    ? t("See reviews")
    : ratings.length === 1
      ? t("1 friend rated this")
      : t("{count} friends rated this", { count: ratings.length });

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={empty ? t("See reviews of this title") : label}
        className={`group inline-flex h-12 items-center gap-2.5 rounded-full bg-white/[0.06] text-[15px] font-semibold text-ink ring-1 ring-inset ring-edge-soft transition-colors duration-150 hover:bg-white/[0.10] active:scale-[0.98] ${
          empty ? "px-6" : "pe-5 ps-1.5"
        } ${className}`}
      >
        {empty ? (
          <MessageSquare
            size={17}
            strokeWidth={2.2}
            className="text-ink-muted transition-colors group-hover:text-ink"
          />
        ) : (
          <span className="flex">
            {handles.map((handle, index) => (
              <span
                key={handle}
                className="inline-flex shrink-0 overflow-hidden rounded-full ring-2 ring-canvas"
                style={{ marginInlineStart: index === 0 ? 0 : -10 }}
              >
                <Avatar src={avatars.get(handle)} size={32} alias={handle} />
              </span>
            ))}
          </span>
        )}
        <span className="whitespace-nowrap">{label}</span>
      </button>
      {open && <TitleReviewsPanel target={target} onClose={() => setOpen(false)} />}
    </>
  );
}
