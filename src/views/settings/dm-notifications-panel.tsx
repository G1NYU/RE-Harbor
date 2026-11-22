import { useRef, useState } from "react";
import { Eye, Trash2, Upload, Volume2 } from "lucide-react";
import { useT } from "@/lib/i18n";
import {
  clearDmCustomSound,
  saveDmCustomSound,
  saveDmCustomSoundVolume,
  saveDmSoundEnabled,
  saveDmToastEnabled,
  useDmPrefs,
} from "@/lib/social/dm-preferences";
import { requestDmToastPreview } from "@/lib/social/dm-store";
import { playDmChime } from "@/lib/social/dm-chime";
import { Section, ToggleRow } from "./shared";

const MAX_SOUND_BYTES = 1.5 * 1024 * 1024;

export function DmNotificationsPanel() {
  const t = useT();
  const prefs = useDmPrefs();
  const fileRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [savingSound, setSavingSound] = useState(false);
  const [volumeError, setVolumeError] = useState(false);

  const uploadSound = async (event: { currentTarget: HTMLInputElement }) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;

    const audioExtension = /\.(aac|flac|m4a|mp3|ogg|wav|webm)$/i.test(file.name);
    if ((!file.type.startsWith("audio/") && !audioExtension) || file.size > MAX_SOUND_BYTES) {
      setError(t("Choose an audio file no larger than 1.5 MB."));
      return;
    }

    setSavingSound(true);
    setError(null);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () =>
          typeof reader.result === "string"
            ? resolve(reader.result)
            : reject(new Error("Could not read audio file."));
        reader.onerror = () => reject(new Error("Could not read audio file."));
        reader.readAsDataURL(file);
      });
      saveDmCustomSound({ dataUrl, name: file.name });
    } catch {
      setError(t("Could not save this alert sound."));
    } finally {
      setSavingSound(false);
    }
  };

  const toggleToast = (enabled: boolean) => {
    setError(null);
    try {
      saveDmToastEnabled(enabled);
    } catch {
      setError(t("Could not save the preview setting."));
    }
  };

  const toggleSound = (enabled: boolean) => {
    setError(null);
    try {
      saveDmSoundEnabled(enabled);
    } catch {
      setError(t("Could not save the sound setting."));
    }
  };

  const removeSound = () => {
    setError(null);
    try {
      clearDmCustomSound();
    } catch {
      setError(t("Could not remove the custom alert sound."));
    }
  };

  return (
    <Section
      title={t("Direct message alerts")}
      subtitle={t("Choose how Harbor alerts you when a new direct message arrives.")}
    >
      <div className="hset-row items-center">
        <span className="hset-row-text flex min-w-0 flex-1 flex-col gap-1">
          <span className="hset-row-title text-[16.5px] font-medium leading-6 text-ink">
            {t("Message preview toast")}
          </span>
          <span className="hset-row-desc text-[15.5px] leading-[22px] text-ink-muted">
            {t("Show a pop-up with the sender and message snippet for new DMs.")}
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-3">
          <button
            type="button"
            onClick={requestDmToastPreview}
            title={t(
              "Show a sample toast. It is not a real message, and clicking it does nothing.",
            )}
            aria-label={t("Preview message toast")}
            className="grid h-10 w-10 place-items-center rounded-md text-ink-subtle transition-colors hover:bg-elevated hover:text-ink"
          >
            <Eye size={18} />
          </button>
          <button
            type="button"
            role="switch"
            aria-checked={prefs.toastEnabled}
            aria-label={t("Message preview toast")}
            onClick={() => toggleToast(!prefs.toastEnabled)}
            className={`relative inline-flex h-8 w-12 shrink-0 items-center rounded-full p-[3px] transition-colors ${prefs.toastEnabled ? "bg-ink" : "bg-edge"}`}
          >
            <span
              className={`block h-[26px] w-[26px] rounded-full bg-canvas transition-transform ${prefs.toastEnabled ? "translate-x-4 rtl:-translate-x-4" : "translate-x-0"}`}
            />
          </button>
        </span>
      </div>

      <ToggleRow
        label={t("Message sound alert")}
        sub={t("Play a sound when a new DM arrives.")}
        value={prefs.soundEnabled}
        onChange={toggleSound}
        leading={<Volume2 size={19} />}
      />

      <div className="flex flex-wrap items-center gap-2 px-4 py-3">
        <input
          ref={fileRef}
          type="file"
          accept="audio/*"
          className="hidden"
          onChange={(event) => void uploadSound(event)}
        />
        <button
          type="button"
          disabled={savingSound}
          onClick={() => fileRef.current?.click()}
          className="inline-flex min-h-10 items-center gap-2 rounded-md bg-ink px-3.5 text-[13px] font-semibold text-canvas transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          <Upload size={15} />
          {savingSound
            ? t("Saving…")
            : prefs.customSound
              ? t("Replace custom sound")
              : t("Upload custom sound")}
        </button>
        <button
          type="button"
          onClick={playDmChime}
          className="inline-flex min-h-10 items-center rounded-md px-3 text-[13px] font-medium text-ink-muted transition-colors hover:bg-elevated hover:text-ink"
        >
          {t("Test sound")}
        </button>
        {prefs.customSound && (
          <>
            <span className="max-w-[220px] truncate text-[12px] text-ink-subtle">
              {prefs.customSound.name}
            </span>
            <button
              type="button"
              onClick={removeSound}
              aria-label={t("Remove custom sound")}
              className="grid h-9 w-9 place-items-center rounded-md text-ink-subtle transition-colors hover:bg-elevated hover:text-danger"
            >
              <Trash2 size={15} />
            </button>
          </>
        )}
      </div>
      <div className="flex items-center gap-4 px-4 pb-4">
        <label htmlFor="dm-custom-sound-volume" className="text-[13px] font-medium text-ink-muted">
          {t("Custom sound volume")}
        </label>
        <input
          id="dm-custom-sound-volume"
          type="range"
          min={0}
          max={70}
          step={1}
          value={prefs.customSoundVolume}
          aria-label={t("Custom sound volume")}
          onChange={(event) => {
            setVolumeError(false);
            try {
              saveDmCustomSoundVolume(Number(event.currentTarget.value));
            } catch {
              setVolumeError(true);
            }
          }}
          className="h-2 w-40 cursor-pointer accent-ink"
        />
        <output className="min-w-10 text-right text-[13px] tabular-nums text-ink-subtle">
          {prefs.customSoundVolume}%
        </output>
      </div>
      {volumeError && (
        <p className="px-4 pb-3 text-[13px] text-danger" role="alert">
          {t("Could not save the custom sound volume.")}
        </p>
      )}
      {error && (
        <p className="px-4 pb-3 text-[13px] text-danger" role="alert">
          {error}
        </p>
      )}
    </Section>
  );
}
