import { useState } from "react";
import { Loader2 } from "lucide-react";
import { useT } from "@/lib/i18n";
import {
  BELL_CATEGORIES,
  setBellPreference,
  useBellPreferences,
  type BellCategory,
} from "@/lib/social/notification-preferences";

export function NotificationPreferences({ onUpdated }: { onUpdated: () => void }) {
  const t = useT();
  const preferences = useBellPreferences();
  const [busy, setBusy] = useState<BellCategory | null>(null);
  const [error, setError] = useState<string | null>(null);
  const set = async (category: BellCategory, enabled: boolean) => {
    setBusy(category);
    setError(null);
    try {
      await setBellPreference(category, enabled);
    } catch {
      setError(t("Saved on this device. Could not sync your notification settings. Try again."));
    } finally {
      setBusy(null);
      onUpdated();
    }
  };
  const groups = [...new Set(BELL_CATEGORIES.map((item) => item.group))];
  return (
    <div className="min-h-0 overflow-y-auto px-4 pb-4">
      <p className="mb-4 text-xs leading-relaxed text-ink-muted">
        {t(
          "Choose which notifications appear in your bell. Disabled categories will not add to its unread count.",
        )}
      </p>
      {error && (
        <p role="alert" className="mb-3 text-xs text-danger">
          {error}
        </p>
      )}
      {groups.map((group) => (
        <section key={group} className="mb-4">
          <h3 className="mb-1 text-[10.5px] font-semibold uppercase tracking-wider text-ink-subtle">
            {t(group)}
          </h3>
          <div className="divide-y divide-edge-soft">
            {BELL_CATEGORIES.filter((item) => item.group === group).map(({ id, label }) => (
              <label
                key={id}
                className="flex min-h-11 cursor-pointer items-center justify-between gap-3 py-2 text-[12.5px] text-ink"
              >
                <span>{t(label)}</span>
                <span className="inline-flex items-center gap-2">
                  {busy === id && <Loader2 size={13} className="animate-spin text-ink-subtle" />}
                  <button
                    type="button"
                    role="switch"
                    aria-label={t(label)}
                    aria-checked={preferences[id]}
                    disabled={!!busy}
                    onClick={() => void set(id, !preferences[id])}
                    className={`relative h-5 w-9 shrink-0 rounded-full p-0.5 transition-colors disabled:opacity-60 ${preferences[id] ? "bg-accent" : "bg-edge"}`}
                  >
                    <span
                      className={`block h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${preferences[id] ? "translate-x-4 rtl:-translate-x-4" : "translate-x-0"}`}
                    />
                  </button>
                </span>
              </label>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
