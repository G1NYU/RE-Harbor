import { PRESENCE_META, type PresenceStatus } from "@/lib/social/presence";
import type { DmUser } from "@/lib/social/dm";

const SIZE = {
  sm: "h-8 w-8 text-[12px]",
  md: "h-10 w-10 text-[14px]",
  lg: "h-11 w-11 text-[15px]",
} as const;

export function DmAvatar({
  user,
  size = "md",
  showPresence = false,
}: {
  user: Pick<DmUser, "displayName" | "avatarUrl" | "presence"> | null;
  size?: keyof typeof SIZE;
  showPresence?: boolean;
}) {
  const label = (user?.displayName || "?").trim().slice(0, 1).toUpperCase();
  const presence = (user?.presence ?? "offline") as PresenceStatus;
  return (
    <span className={`relative inline-flex shrink-0 ${SIZE[size]}`}>
      {user?.avatarUrl ? (
        <img
          src={user.avatarUrl}
          alt=""
          loading="lazy"
          className="h-full w-full rounded-full object-cover ring-1 ring-edge-soft"
          style={{ clipPath: "circle(50%)" }}
        />
      ) : (
        <span className="grid h-full w-full place-items-center rounded-full bg-elevated font-semibold text-ink-muted ring-1 ring-edge-soft">
          {label}
        </span>
      )}
      {showPresence && (
        <span
          aria-hidden
          className={`absolute -bottom-0.5 -end-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-canvas ${PRESENCE_META[presence].dot}`}
        />
      )}
    </span>
  );
}
