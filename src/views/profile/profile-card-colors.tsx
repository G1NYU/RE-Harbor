import { useEffect, useState } from "react";
import { useT } from "@/lib/i18n";
import { normalizeHexColor } from "@/lib/profile-theme";
import {
  CARD_THEMES,
  type CardAppearancePatch,
  type CardThemeId,
} from "@/lib/social/profile-card-appearance";
import type { ProfileSummary } from "./profile-types";
import { ProfileCardPanel } from "./profile-card-panel";

const TEXT_COLORS = [
  { key: "nameColor", label: "Name", fallback: "#f7f7fa", field: "cardNameColor" },
  { key: "handleColor", label: "Handle", fallback: "#a5a5b4", field: "cardHandleColor" },
  { key: "bioColor", label: "Bio", fallback: "#c6c6d0", field: "cardBioColor" },
  { key: "textColor", label: "Other text", fallback: "#c6c6d0", field: "cardTextColor" },
] as const;
type TextKey = (typeof TEXT_COLORS)[number]["key"];
const defaultText = Object.fromEntries(
  TEXT_COLORS.map((item) => [item.key, item.fallback]),
) as Record<TextKey, string>;

export function ProfileCardColors({
  profile,
  busy,
  onApply,
}: {
  profile: ProfileSummary;
  busy: boolean;
  onApply: (patch: CardAppearancePatch) => Promise<void>;
}) {
  const t = useT();
  const appearance = profile.profileCard;
  const [theme, setTheme] = useState<CardThemeId | null>(null);
  const [from, setFrom] = useState("#17171f");
  const [to, setTo] = useState("#30283f");
  const [gradient, setGradient] = useState(false);
  const [colors, setColors] = useState(defaultText);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setTheme((appearance?.theme as CardThemeId) ?? null);
    setFrom(appearance?.from ?? "#17171f");
    setTo(appearance?.to ?? "#30283f");
    setGradient(!!appearance?.from && appearance.from !== appearance.to);
    setColors(
      Object.fromEntries(
        TEXT_COLORS.map((item) => [item.key, appearance?.[item.key] ?? item.fallback]),
      ) as Record<TextKey, string>,
    );
  }, [appearance]);
  const custom = (change: () => void) => {
    setTheme("custom");
    change();
  };
  const validFrom = normalizeHexColor(from) ?? "#17171f";
  const validTo = normalizeHexColor(gradient ? to : from) ?? validFrom;
  const preview = {
    ...profile,
    profileCard: {
      ...appearance,
      theme,
      from: theme ? validFrom : null,
      to: theme ? validTo : null,
      gradient: theme ? `linear-gradient(135deg, ${validFrom}, ${validTo})` : null,
      accent: null,
      bgUrl: appearance?.bgUrl ?? null,
      bgKind: appearance?.bgKind ?? null,
      customised: !!theme,
      ...Object.fromEntries(
        TEXT_COLORS.map((item) => [item.key, normalizeHexColor(colors[item.key]) ?? item.fallback]),
      ),
    },
  };
  const apply = async () => {
    if (
      (theme === "custom" &&
        (!normalizeHexColor(from) || !normalizeHexColor(gradient ? to : from))) ||
      TEXT_COLORS.some((item) => !normalizeHexColor(colors[item.key]))
    ) {
      setError(t("Enter a valid hex color, such as #1a2b3c."));
      return;
    }
    setError(null);
    await onApply({
      cardTheme: theme,
      cardAccent: null,
      ...(theme === "custom" ? { cardFrom: validFrom, cardTo: validTo } : {}),
      ...Object.fromEntries(
        TEXT_COLORS.map((item) => [item.field, normalizeHexColor(colors[item.key])]),
      ),
    });
  };
  const field = (label: string, value: string, change: (next: string) => void) => (
    <label className="flex min-w-0 items-center justify-between gap-3 text-xs text-ink-muted">
      <span>{label}</span>
      <span className="flex items-center gap-2">
        <input
          type="color"
          aria-label={label}
          disabled={busy}
          value={normalizeHexColor(value) ?? "#17171f"}
          onChange={(event) => change(event.target.value)}
          className="h-8 w-8 rounded border-0 bg-transparent p-0"
        />
        <input
          type="text"
          aria-label={t("{label} hex", { label })}
          value={value}
          disabled={busy}
          maxLength={7}
          onChange={(event) => change(event.target.value)}
          className="w-24 rounded bg-surface px-2 py-1.5 font-mono text-xs text-ink ring-1 ring-edge-soft"
        />
      </span>
    </label>
  );
  return (
    <div className="mt-3 space-y-5">
      <ProfileCardPanel profile={preview} className="mx-auto max-w-[320px]" />
      <div>
        <h3 className="mb-2 text-xs font-medium text-ink">{t("Card theme")}</h3>
        <div className="grid grid-cols-4 gap-2">
          {[{ id: null, label: "Default", from: "#17171f", to: "#17171f" }, ...CARD_THEMES].map(
            (preset) => (
              <button
                key={preset.id ?? "default"}
                type="button"
                disabled={busy}
                aria-pressed={theme === preset.id}
                onClick={() => {
                  setTheme(preset.id);
                  setFrom(preset.from);
                  setTo(preset.to);
                  setGradient(preset.from !== preset.to);
                }}
                className={`h-11 rounded-lg border ${theme === preset.id ? "border-ink ring-1 ring-ink" : "border-edge-soft"}`}
                style={{ background: `linear-gradient(135deg, ${preset.from}, ${preset.to})` }}
              >
                <span className="rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white">
                  {t(preset.label)}
                </span>
              </button>
            ),
          )}
        </div>
      </div>
      <div className="rounded-xl bg-canvas/40 p-3 ring-1 ring-edge-soft">
        <h3 className="text-xs font-medium text-ink">{t("Customize theme")}</h3>
        <div className="my-3 flex gap-2">
          {[false, true].map((mode) => (
            <button
              type="button"
              key={String(mode)}
              disabled={busy}
              aria-pressed={gradient === mode}
              onClick={() => custom(() => setGradient(mode))}
              className={`rounded-full px-3 py-1.5 text-xs ring-1 ${gradient === mode ? "bg-accent/15 text-accent ring-accent/40" : "text-ink-muted ring-edge-soft"}`}
            >
              {mode ? t("Gradient") : t("Solid color")}
            </button>
          ))}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {field(gradient ? t("Theme color 1") : t("Theme color"), from, (next) =>
            custom(() => setFrom(next)),
          )}
          {gradient && field(t("Theme color 2"), to, (next) => custom(() => setTo(next)))}
        </div>
        <p className="mt-2 text-xs text-ink-subtle">
          {t("Changes the card background behind your profile details.")}
        </p>
      </div>
      <div>
        <h3 className="mb-3 text-xs font-medium text-ink">{t("Text colors")}</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          {TEXT_COLORS.map((item) => (
            <div key={item.key}>
              {field(t(item.label), colors[item.key], (value) =>
                setColors((previous) => ({ ...previous, [item.key]: value })),
              )}
            </div>
          ))}
        </div>
      </div>
      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={busy}
          onClick={() => void apply()}
          className="min-h-9 rounded-full bg-elevated px-4 text-xs font-semibold text-ink ring-1 ring-edge-soft hover:bg-raised disabled:opacity-60"
        >
          {busy ? t("Saving...") : t("Apply appearance")}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            setTheme(null);
            setFrom("#17171f");
            setTo("#17171f");
            setGradient(false);
            setColors(defaultText);
            setError(null);
          }}
          className="text-xs text-ink-muted hover:text-ink"
        >
          {t("Reset colors")}
        </button>
      </div>
    </div>
  );
}
