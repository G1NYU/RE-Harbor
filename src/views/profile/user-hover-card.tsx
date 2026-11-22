import {
  cloneElement,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type FocusEvent as ReactFocusEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactElement,
} from "react";
import { createPortal } from "react-dom";
import { requestOpenProfile } from "@/lib/social/open-profile";
import { useReducedMotion } from "@/lib/use-reduced-motion";
import { useT } from "@/lib/i18n";
import { useContextMenuActions } from "@/lib/context-menu";
import { userContextTarget } from "./context-targets";
import type { PresenceStatus } from "@/lib/social/presence";
import { fetchBadges } from "./profile-api";
import { loadProfileCardSummary, useProfileCardSummary } from "@/lib/social/profile-card-summary";
import { ProfileCardPanel } from "./profile-card-panel";
import { orderShownBadges } from "./badge-catalog";
import { HoverTooltip } from "@/components/hover-tooltip";
import { useSelfAvatar } from "./use-self-avatar";
import type { Badge, ProfileSummary } from "./profile-types";

type CardData = { summary: ProfileSummary; badges: Badge[] };

const TTL = 30000;
const cache = new Map<string, { data: CardData; at: number }>();
const inflight = new Map<string, Promise<CardData>>();

function loadCard(handle: string): Promise<CardData> {
  const key = handle.toLowerCase();
  const cached = cache.get(key);
  if (cached && Date.now() - cached.at < TTL) return Promise.resolve(cached.data);
  const pending = inflight.get(key);
  if (pending) return pending;
  const req = Promise.all([
    loadProfileCardSummary(key),
    fetchBadges(key).catch(() => [] as Badge[]),
  ])
    .then(([summary, badges]) => {
      const data: CardData = { summary, badges };
      cache.set(key, { data, at: Date.now() });
      inflight.delete(key);
      return data;
    })
    .catch((err) => {
      inflight.delete(key);
      throw err;
    });
  inflight.set(key, req);
  return req;
}

const CARD_W = 300;

export function UserHoverCard({
  handle,
  presence,
  children,
}: {
  handle: string;
  presence?: PresenceStatus;
  children: ReactElement<any>;
}) {
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const { open } = useContextMenuActions();
  const ref = useRef<HTMLElement>(null);
  const openTimer = useRef<number | null>(null);
  const closeTimer = useRef<number | null>(null);

  const clearOpen = () => {
    if (openTimer.current) window.clearTimeout(openTimer.current);
    openTimer.current = null;
  };
  const clearClose = () => {
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
    closeTimer.current = null;
  };

  const scheduleOpen = () => {
    clearClose();
    if (openTimer.current || anchor) return;
    openTimer.current = window.setTimeout(() => {
      openTimer.current = null;
      if (ref.current) setAnchor(ref.current.getBoundingClientRect());
    }, HOVER_CARD_OPEN_MS);
  };
  const scheduleClose = () => {
    clearOpen();
    if (closeTimer.current) return;
    closeTimer.current = window.setTimeout(() => {
      closeTimer.current = null;
      setAnchor(null);
    }, HOVER_CARD_CLOSE_MS);
  };

  useEffect(() => {
    if (!anchor) return;
    const close = () => setAnchor(null);
    window.addEventListener("scroll", close, true);
    return () => window.removeEventListener("scroll", close, true);
  }, [anchor]);

  useEffect(
    () => () => {
      clearOpen();
      clearClose();
    },
    [],
  );

  const childProps = children.props as {
    onMouseEnter?: (e: unknown) => void;
    onMouseLeave?: (e: unknown) => void;
    onFocus?: (e: unknown) => void;
    onBlur?: (e: unknown) => void;
    onClick?: (e: unknown) => void;
    onContextMenu?: (e: ReactMouseEvent) => void;
  };

  const trigger = cloneElement(children, {
    ref,
    onContextMenu: (event: ReactMouseEvent) => {
      childProps.onContextMenu?.(event);
      if (event.defaultPrevented) return;
      clearOpen();
      clearClose();
      setAnchor(null);
      open(event, userContextTarget(handle));
    },
    onMouseEnter: (e: ReactMouseEvent) => {
      childProps.onMouseEnter?.(e);
      scheduleOpen();
    },
    onMouseLeave: (e: ReactMouseEvent) => {
      childProps.onMouseLeave?.(e);
      scheduleClose();
    },
    onFocus: (e: ReactFocusEvent) => {
      childProps.onFocus?.(e);
      scheduleOpen();
    },
    onBlur: (e: ReactFocusEvent) => {
      childProps.onBlur?.(e);
      scheduleClose();
    },
    onClick: (e: ReactMouseEvent) => {
      clearOpen();
      clearClose();
      setAnchor(null);
      childProps.onClick?.(e);
    },
  });

  return (
    <>
      {trigger}
      {anchor && (
        <ProfileHoverCard
          handle={handle}
          presence={presence}
          anchor={anchor}
          onEnter={clearClose}
          onLeave={scheduleClose}
        />
      )}
    </>
  );
}

export const HOVER_CARD_OPEN_MS = 250;
export const HOVER_CARD_CLOSE_MS = 180;

export function ProfileHoverCard({
  handle,
  presence: presenceOverride,
  anchor,
  onEnter,
  onLeave,
}: {
  handle: string;
  presence?: PresenceStatus;
  anchor: DOMRect;
  onEnter: () => void;
  onLeave: () => void;
}) {
  const t = useT();
  const { open } = useContextMenuActions();
  const reduced = useReducedMotion();
  const self = useSelfAvatar();
  const key = handle.toLowerCase();
  const [data, setData] = useState<CardData | null>(() => cache.get(key)?.data ?? null);
  const [failed, setFailed] = useState(false);
  const [placed, setPlaced] = useState<{ top: number; left: number } | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const { summary: sharedSummary } = useProfileCardSummary(handle, cardRef);

  useEffect(() => {
    let cancelled = false;
    loadCard(key)
      .then((d) => !cancelled && setData(d))
      .catch(() => {
        if (!cancelled && !cache.get(key)) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [key]);

  useLayoutEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    const gap = 10;
    const h = el.offsetHeight;
    const leftSlot = anchor.left - gap - CARD_W;
    const left =
      leftSlot >= 12 ? leftSlot : Math.min(anchor.right + gap, window.innerWidth - CARD_W - 12);
    const top = Math.max(12, Math.min(anchor.top, window.innerHeight - h - 12));
    setPlaced({ top, left });
  }, [anchor, data, sharedSummary, failed]);

  const summary = sharedSummary ?? data?.summary;
  const badges = orderShownBadges(data?.badges ?? [], data?.summary?.shownBadges);
  const mine = !!self.handle && self.handle.toLowerCase() === key;
  const cardAvatar = mine ? (self.avatar ?? summary?.avatarUrl) : summary?.avatarUrl;

  return createPortal(
    <div
      ref={cardRef}
      onContextMenu={(event) => open(event, userContextTarget(handle))}
      role="button"
      tabIndex={-1}
      aria-label={t("Open @{handle} profile", { handle: summary?.handle ?? handle })}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      onClick={(event) => {
        event.stopPropagation();
        requestOpenProfile(handle);
      }}
      style={{
        width: CARD_W,
        left: placed?.left ?? anchor.left,
        top: placed?.top ?? anchor.bottom + 8,
        visibility: placed ? "visible" : "hidden",
      }}
      className={`fixed z-[260] cursor-pointer overflow-hidden rounded-[20px] shadow-[0_28px_70px_-20px_rgba(0,0,0,0.85)] backdrop-blur-xl ${
        reduced ? "" : "animate-popover-in"
      }`}
    >
      <ProfileCardPanel
        profile={{
          ...summary,
          handle: summary?.handle ?? handle,
          alias: summary?.alias ?? handle,
          avatarUrl: cardAvatar,
        }}
        presence={presenceOverride}
        loading={!summary && !failed}
        failed={failed && !summary}
        badges={
          badges.length > 0 ? (
            <div className="flex flex-wrap items-center gap-1.5">
              {badges.slice(0, 6).map((badge) => (
                <BadgeDot key={badge.id} badge={badge} />
              ))}
              {badges.length > 6 && (
                <span className="text-[11px] text-ink-subtle">+{badges.length - 6}</span>
              )}
            </div>
          ) : undefined
        }
      />
    </div>,
    document.body,
  );
}

function BadgeDot({ badge }: { badge: Badge }) {
  return (
    <HoverTooltip
      label={badge.name}
      sublabel={badge.description || null}
      side="top"
      align="center"
      className="grid h-6 w-6 place-items-center"
    >
      {badge.iconUrl ? (
        <img
          src={badge.iconUrl}
          alt=""
          draggable={false}
          className="h-full w-full object-contain drop-shadow-[0_1px_3px_rgba(0,0,0,0.4)]"
        />
      ) : (
        <span className="text-[10px] font-semibold text-ink">
          {badge.name.charAt(0).toUpperCase()}
        </span>
      )}
    </HoverTooltip>
  );
}
