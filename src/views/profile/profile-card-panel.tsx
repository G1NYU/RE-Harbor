import type { ReactNode } from "react";
import { useT } from "@/lib/i18n";
import { countryFlagSrc } from "@/components/flag";
import {
  PRESENCE_META,
  presenceStatusLabel,
  resolvePresence,
  type PresenceStatus,
} from "@/lib/social/presence";
import { profileCardStyle, profileBackgroundUrl } from "@/lib/social/profile-card-appearance";
import { Avatar, VerifiedCheck } from "./profile-bits";
import { countryName } from "./flags";
import { ProfileJoinedAt } from "./profile-joined-at";
import type { ProfileSummary } from "./profile-types";

export type CardProfile = Pick<ProfileSummary, "handle" | "alias"> & Partial<ProfileSummary>;

/** Shared identity panel for discovery, hover previews and the card settings preview. */
export function ProfileCardPanel({
  profile,
  presence: override,
  loading = false,
  failed = false,
  onOpen,
  badges,
  footer,
  className = "",
}: {
  profile: CardProfile;
  presence?: PresenceStatus;
  loading?: boolean;
  failed?: boolean;
  onOpen?: () => void;
  badges?: ReactNode;
  footer?: ReactNode;
  className?: string;
}) {
  const t = useT();
  const presence = override ?? resolvePresence(profile.presence ?? profile.status, profile.online);
  const flag = profile.location ? countryFlagSrc(profile.location) : null;
  const bio =
    profile.slogan?.trim() ||
    profile.description
      ?.replace(/<[^>]*>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  const banner = profileBackgroundUrl(profile);
  const content = (
    <>
      <div
        className="relative h-[88px] w-full overflow-hidden"
        style={
          banner
            ? undefined
            : {
                backgroundImage:
                  "radial-gradient(ellipse at top left, var(--color-accent-soft), transparent 75%)",
              }
        }
      >
        {banner && (
          <img src={banner} alt="" draggable={false} className="h-full w-full object-cover" />
        )}
      </div>
      <div className="relative px-4 pb-4">
        <span className="-mt-8 mb-3 inline-flex rounded-full bg-elevated p-[3px]">
          <Avatar
            src={profile.avatarUrl}
            size={60}
            dotClass={loading ? undefined : PRESENCE_META[presence].dot}
            alias={profile.alias}
          />
        </span>
        <div className="flex min-w-0 items-center gap-1.5">
          <span
            style={{ color: "var(--profile-card-name)" }}
            className="truncate font-display text-[17px] font-semibold text-ink"
          >
            {profile.alias}
          </span>
          {profile.verified && <VerifiedCheck size={16} />}
        </div>
        <div
          style={{ color: "var(--profile-card-handle)" }}
          className="mt-0.5 truncate text-[12.5px] text-ink-subtle"
        >
          @{profile.handle}
        </div>
        {loading ? (
          <div aria-label={t("Loading profile")} className="mt-3 space-y-2">
            <div className="h-3 w-24 animate-pulse rounded bg-raised" />
            <div className="h-3 w-full animate-pulse rounded bg-raised" />
          </div>
        ) : (
          <>
            <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11.5px] text-ink-muted">
              <span className="inline-flex items-center gap-1.5">
                <span className={`h-2 w-2 rounded-full ${PRESENCE_META[presence].dot}`} />
                {t(presenceStatusLabel(presence))}
              </span>
              {profile.location && (
                <span className="inline-flex min-w-0 items-center gap-1.5">
                  <span className="text-ink-subtle">·</span>
                  {flag && (
                    <img src={flag} alt="" className="h-3 w-[18px] rounded-sm object-cover" />
                  )}
                  <span className="truncate">{countryName(profile.location)}</span>
                </span>
              )}
            </div>
            {bio && (
              <p
                style={{ color: "var(--profile-card-bio)" }}
                className="mt-3 line-clamp-3 border-t border-edge-soft/60 pt-3 text-[12.5px] leading-relaxed text-ink-muted"
              >
                {bio}
              </p>
            )}
            <ProfileJoinedAt
              value={profile.memberSince}
              show={profile.showJoinDate !== false}
              className="mt-3 block text-[10.5px] leading-relaxed text-ink-subtle"
            />
            {failed && (
              <p className="mt-3 text-xs text-ink-subtle">
                {t("Preview unavailable. Click to open profile.")}
              </p>
            )}
          </>
        )}
      </div>
    </>
  );
  return (
    <article
      style={profileCardStyle(profile.profileCard)}
      className={`min-w-0 overflow-hidden rounded-[20px] border border-edge bg-elevated text-ink ${className}`}
    >
      {onOpen ? (
        <button
          type="button"
          onClick={onOpen}
          aria-label={t("Open {alias} profile", { alias: profile.alias })}
          className="block w-full text-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent"
        >
          {content}
        </button>
      ) : (
        content
      )}
      {badges && <div className="px-4 pb-3">{badges}</div>}
      {footer && <div className="border-t border-edge-soft px-4 py-3">{footer}</div>}
    </article>
  );
}
