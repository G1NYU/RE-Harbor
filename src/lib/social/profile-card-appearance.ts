import { authToken, captureSessionScope } from "@/lib/theme-auth";
import { HARBOR_API_BASE } from "@/lib/config/endpoints";
import { socialPatch } from "./client";
import type { ProfileSummary } from "@/views/profile/profile-types";
import type { CSSProperties } from "react";
import type { ProfileCardAppearance } from "./profile-card-appearance-types";
import { publishProfileCardSummary } from "./profile-card-summary";
import { removeBanner } from "./banner";

// Colors are scoped to cards. The uploaded background is shared with the profile banner.

const API = `${HARBOR_API_BASE}/themes/api`;

export type CardThemeId =
  | "harbor"
  | "aurora"
  | "midnight"
  | "ember"
  | "forest"
  | "rose"
  | "mono"
  | "custom";
export type CardAppearancePatch = {
  cardTheme?: CardThemeId | null;
  cardAccent?: string | null;
  cardNameColor?: string | null;
  cardHandleColor?: string | null;
  cardBioColor?: string | null;
  cardTextColor?: string | null;
  cardFrom?: string;
  cardTo?: string;
};

export type CardThemePreset = {
  id: CardThemeId;
  label: string;
  from: string;
  to: string;
  accent: string;
};

/**
 * Mirrors `ecosystem/social/card-appearance.js`. The server rejects an unknown id, so a
 * drift between the two is a visible 422 rather than a silently different card. The
 * gradient is only used to draw the picker before anything is saved; what the app
 * renders afterwards comes from the API, which is the single source of truth.
 */
export const CARD_THEMES: CardThemePreset[] = [
  { id: "harbor", label: "Harbor", from: "#7b5cff", to: "#1b1030", accent: "#7b5cff" },
  { id: "aurora", label: "Aurora", from: "#22d3ee", to: "#4f46e5", accent: "#22d3ee" },
  { id: "midnight", label: "Midnight", from: "#1e293b", to: "#020617", accent: "#94a3b8" },
  { id: "ember", label: "Ember", from: "#f97316", to: "#7f1d1d", accent: "#fb923c" },
  { id: "forest", label: "Forest", from: "#10b981", to: "#064e3b", accent: "#34d399" },
  { id: "rose", label: "Rose", from: "#f43f5e", to: "#4c0519", accent: "#fb7185" },
  { id: "mono", label: "Mono", from: "#262626", to: "#0a0a0a", accent: "#a3a3a3" },
];

export const CARD_MAX_BYTES = 8 * 1024 * 1024;
export const CARD_MAX_FRAMES = 200;
export const CARD_MIN_WIDTH = 320;
export const CARD_MIN_HEIGHT = 160;

/** What the server publishes about a card. Absent means "default appearance". */
export type ProfileCardLook = {
  theme: CardThemeId | null;
  gradient: string | null;
  from: string | null;
  to: string | null;
  accent: string | null;
  bgUrl: string | null;
  bgKind: "image" | "gif" | null;
  customised: boolean;
};

export function cardThemeById(id: string | null | undefined): CardThemePreset | null {
  if (!id) return null;
  return CARD_THEMES.find((t) => t.id === id) ?? null;
}

export function profileBackgroundUrl(
  profile: { profileCard?: { bgUrl?: string | null }; bannerUrl?: string } | undefined,
): string | undefined {
  const url = profile?.profileCard?.bgUrl || profile?.bannerUrl;
  return url?.startsWith("/") ? `${HARBOR_API_BASE}${url}` : url;
}

/** The CSS a card surface should paint, given what the API published. */
export function cardBackground(
  look: { bgUrl?: string | null; gradient?: string | null } | undefined,
): {
  backgroundImage?: string;
  backgroundColor?: string;
} {
  if (!look) return {};
  if (look.bgUrl)
    return { backgroundImage: `url("${profileBackgroundUrl({ profileCard: look })}")` };
  if (look.gradient) return { backgroundImage: look.gradient };
  return {};
}

/** Scoped tokens keep a user's card preference off the surrounding page. */
export function profileCardStyle(look?: ProfileCardAppearance): CSSProperties {
  const preset =
    look?.theme === "custom" &&
    /^#[0-9a-f]{6}$/i.test(look.from ?? "") &&
    /^#[0-9a-f]{6}$/i.test(look.to ?? "")
      ? { from: look.from!, to: look.to!, accent: "#7b5cff" }
      : cardThemeById(look?.theme);
  const accent = /^#[0-9a-f]{6}$/i.test(look?.accent ?? "") ? look!.accent : preset?.accent;
  if (
    !preset &&
    !accent &&
    !look?.nameColor &&
    !look?.handleColor &&
    !look?.bioColor &&
    !look?.textColor
  )
    return {};
  return {
    ...(preset ? { backgroundImage: `linear-gradient(135deg, ${preset.from}, ${preset.to})` } : {}),
    ...(preset
      ? {
          "--color-canvas": preset.to,
          "--color-surface": preset.to,
          "--color-elevated": `color-mix(in srgb, ${preset.to} 88%, #fff)`,
          "--color-raised": `color-mix(in srgb, ${preset.to} 78%, #fff)`,
          "--color-ink": "#f7f7fa",
          "--color-ink-muted": "#c6c6d0",
          "--color-ink-subtle": "#a5a5b4",
          "--color-edge": "#ffffff30",
          "--color-edge-soft": "#ffffff1f",
          colorScheme: "dark",
        }
      : {}),
    ...(look?.textColor
      ? {
          "--color-ink": look.textColor,
          "--color-ink-muted": look.textColor,
          "--color-ink-subtle": look.textColor,
        }
      : {}),
    "--profile-card-name": look?.nameColor ?? "var(--color-ink)",
    "--profile-card-handle": look?.handleColor ?? "var(--color-ink-subtle)",
    "--profile-card-bio": look?.bioColor ?? "var(--color-ink-muted)",
    ...(accent
      ? {
          "--color-accent": accent,
          "--color-accent-soft": `color-mix(in srgb, ${accent} 15%, transparent)`,
        }
      : {}),
  } as CSSProperties;
}

export function saveCardAppearance(input: CardAppearancePatch): Promise<ProfileSummary> {
  const body: Record<string, unknown> = {};
  if (input.cardTheme !== undefined) body.cardTheme = input.cardTheme;
  if (input.cardAccent !== undefined) body.cardAccent = input.cardAccent;
  if (input.cardFrom !== undefined) body.cardFrom = input.cardFrom;
  if (input.cardTo !== undefined) body.cardTo = input.cardTo;
  for (const key of ["cardNameColor", "cardHandleColor", "cardBioColor", "cardTextColor"] as const)
    if (input[key] !== undefined) body[key] = input[key];
  return socialPatch<ProfileSummary>("/social/me/profile", body)
    .then((summary) => {
      const look = summary.profileCard;
      const expected = {
        theme: input.cardTheme,
        from: input.cardFrom,
        to: input.cardTo,
        nameColor: input.cardNameColor,
        handleColor: input.cardHandleColor,
        bioColor: input.cardBioColor,
        textColor: input.cardTextColor,
      };
      if (
        Object.entries(expected).some(
          ([key, value]) =>
            value !== undefined && (look?.[key as keyof ProfileCardAppearance] ?? null) !== value,
        )
      )
        throw new Error(
          "Card appearance requires the latest backend deployment. Your changes have not been saved.",
        );
      publishProfileCardSummary(summary);
      return summary;
    })
    .catch((error: unknown) => {
      if (
        error instanceof Error &&
        /invalid_card_|applyCardFields|Request failed \(500\)/.test(error.message)
      )
        throw new Error(
          "Card appearance requires the latest backend deployment. Your changes have not been saved.",
        );
      throw error;
    });
}

function unwrap(r: Response, isCurrent: () => boolean): Promise<ProfileSummary> {
  return r
    .json()
    .catch(() => ({}))
    .then((d: { error?: string }) => {
      if (!isCurrent()) throw new Error("Account changed");
      if (!r.ok) throw new Error(cardUploadError(d.error));
      const summary = d as ProfileSummary;
      publishProfileCardSummary(summary);
      return summary;
    });
}

function cardUploadError(code: string | undefined): string {
  switch (code) {
    case "too_large":
      return "That file is too large. Use something under 8 MB.";
    case "too_small":
      return "That image is too small for a card background.";
    case "too_many_frames":
      return "That GIF has too many frames.";
    case "unsupported_format":
      return "Cards accept PNG, JPEG, WebP or GIF.";
    case "no_image":
      return "No image was sent.";
    default:
      return "That file could not be used as a card background.";
  }
}

/**
 * Sends the original file rather than a canvas re-encode: a canvas would flatten an
 * animated GIF to one frame, and an animated card background is the point of allowing
 * GIFs at all. The server validates the bytes with sharp and re-encodes stills.
 */
export async function uploadCardBackground(file: File): Promise<ProfileSummary> {
  const isCurrent = captureSessionScope();
  const token = authToken();
  if (!token) throw new Error("Sign in first.");
  if (file.size > CARD_MAX_BYTES) throw new Error(cardUploadError("too_large"));
  const fd = new FormData();
  fd.append("card", file, file.name || "card");
  const r = await fetch(`${API}/social/profile/card-background`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: fd,
  });
  return unwrap(r, isCurrent);
}

export async function removeCardBackground(): Promise<ProfileSummary> {
  const isCurrent = captureSessionScope();
  const token = authToken();
  if (!token) throw new Error("Sign in first.");
  const r = await fetch(`${API}/social/profile/card-background/remove`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  const summary = await unwrap(r, isCurrent);
  if (summary.bannerUrl) {
    const next = await removeBanner();
    if (!isCurrent()) throw new Error("Account changed");
    publishProfileCardSummary(next);
    return next;
  }
  return summary;
}
