import { useSyncExternalStore } from "react";
import { captureSessionScope, currentAuthor } from "@/lib/theme-auth";
import { socialGet, socialPatch } from "./client";

export type DmPolicy = "everyone" | "friends";
export type DmNotifyMode = "sound" | "preview" | "silent";

const POLICY_KEY = "harbor.dm.policy";
const LEGACY_MODE_KEY = "harbor.dm.notify-mode";
const TOAST_KEY = "harbor.dm.toast-enabled";
const SOUND_KEY = "harbor.dm.sound-enabled";
const CUSTOM_SOUND_KEY = "harbor.dm.custom-sound";
const CUSTOM_SOUND_VOLUME_KEY = "harbor.dm.custom-sound-volume";

type CustomAlertSound = { dataUrl: string; name: string } | null;
type DmPrefs = {
  policy: DmPolicy;
  toastEnabled: boolean;
  soundEnabled: boolean;
  customSound: CustomAlertSound;
  customSoundVolume: number;
};

function localValue(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function readPolicy(): DmPolicy {
  return localValue(POLICY_KEY) === "everyone" ? "everyone" : "friends";
}

function validMode(value: unknown): value is DmNotifyMode {
  return value === "sound" || value === "preview" || value === "silent";
}

function readLegacyMode(): DmNotifyMode | null {
  const mode = localValue(LEGACY_MODE_KEY);
  return validMode(mode) ? mode : null;
}

function readToggle(key: string, fallback: boolean): boolean {
  const value = localValue(key);
  return value === "true" ? true : value === "false" ? false : fallback;
}

function readCustomSoundVolume(): number {
  const raw = localValue(CUSTOM_SOUND_VOLUME_KEY);
  if (raw === null) return 50;
  const value = Number(raw);
  return Number.isInteger(value) && value >= 0 && value <= 70 ? value : 50;
}

function readCustomSound(): CustomAlertSound {
  const raw = localValue(CUSTOM_SOUND_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<NonNullable<CustomAlertSound>>;
    return typeof parsed.dataUrl === "string" && typeof parsed.name === "string"
      ? { dataUrl: parsed.dataUrl, name: parsed.name }
      : null;
  } catch {
    return null;
  }
}

const legacyMode = readLegacyMode();
let prefs: DmPrefs = {
  policy: readPolicy(),
  toastEnabled: readToggle(TOAST_KEY, legacyMode ? legacyMode === "preview" : true),
  soundEnabled: readToggle(SOUND_KEY, legacyMode ? legacyMode !== "silent" : true),
  customSound: readCustomSound(),
  customSoundVolume: readCustomSoundVolume(),
};
const listeners = new Set<() => void>();

function emit(): void {
  for (const fn of listeners) fn();
}

function update(patch: Partial<DmPrefs>): void {
  prefs = { ...prefs, ...patch };
  emit();
}

export function currentDmPolicy(): DmPolicy {
  return prefs.policy;
}

export function currentDmToastEnabled(): boolean {
  return prefs.toastEnabled;
}

export function currentDmSoundEnabled(): boolean {
  return prefs.soundEnabled;
}

export function currentDmCustomSound(): CustomAlertSound {
  return prefs.customSound;
}

export function currentDmCustomSoundVolume(): number {
  return prefs.customSoundVolume;
}

export function subscribeDmPrefs(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function useDmPrefs(): DmPrefs {
  return useSyncExternalStore(
    subscribeDmPrefs,
    () => prefs,
    () => prefs,
  );
}

function saveLocalToggle(key: string, patch: Partial<DmPrefs>): void {
  const nextValue = Object.values(patch)[0];
  if (typeof nextValue !== "boolean") return;
  try {
    localStorage.setItem(key, String(nextValue));
  } catch {
    throw new Error("Could not save this setting on this device.");
  }
  update(patch);
}

export function saveDmToastEnabled(enabled: boolean): void {
  saveLocalToggle(TOAST_KEY, { toastEnabled: enabled });
}

export function saveDmSoundEnabled(enabled: boolean): void {
  saveLocalToggle(SOUND_KEY, { soundEnabled: enabled });
}

export function saveDmCustomSoundVolume(volume: number): void {
  const next = Math.max(0, Math.min(70, Math.round(volume)));
  try {
    localStorage.setItem(CUSTOM_SOUND_VOLUME_KEY, String(next));
  } catch {
    throw new Error("Could not save this setting on this device.");
  }
  update({ customSoundVolume: next });
}

export function saveDmCustomSound(sound: NonNullable<CustomAlertSound>): void {
  try {
    localStorage.setItem(CUSTOM_SOUND_KEY, JSON.stringify(sound));
  } catch {
    throw new Error("Could not save this sound on this device.");
  }
  update({ customSound: sound });
}

export function clearDmCustomSound(): void {
  try {
    localStorage.removeItem(CUSTOM_SOUND_KEY);
  } catch {
    throw new Error("Could not remove the custom sound from this device.");
  }
  update({ customSound: null });
}

export function applyDmPrefsFromSummary(
  summary:
    | {
        dmPolicy?: DmPolicy;
        dmNotifyMode?: DmNotifyMode;
      }
    | null
    | undefined,
): void {
  if (!summary) return;
  const patch: Partial<DmPrefs> = {};
  if (summary.dmPolicy === "everyone" || summary.dmPolicy === "friends") {
    patch.policy = summary.dmPolicy;
  }
  if (validMode(summary.dmNotifyMode)) {
    if (localValue(TOAST_KEY) === null) patch.toastEnabled = summary.dmNotifyMode === "preview";
    if (localValue(SOUND_KEY) === null) patch.soundEnabled = summary.dmNotifyMode !== "silent";
  }
  if (Object.keys(patch).length === 0) return;
  update(patch);
}

/** Pull the owner's message privacy and legacy notification preference once per launch. */
export async function hydrateDmPrefsFromServer(): Promise<void> {
  const me = currentAuthor();
  if (!me?.handle) return;
  try {
    const summary = await socialGet<{ dmPolicy?: DmPolicy; dmNotifyMode?: DmNotifyMode }>(
      `/social/u/${encodeURIComponent(me.handle)}`,
    );
    applyDmPrefsFromSummary(summary);
  } catch {
    /* Local alert settings remain available when the social service is offline. */
  }
}

async function patch(body: Record<string, unknown>): Promise<void> {
  await socialPatch("/social/me/profile", body);
}

export async function saveDmPolicy(next: DmPolicy): Promise<void> {
  const isCurrent = captureSessionScope();
  const prev = prefs.policy;
  if (next === prev) return;
  try {
    localStorage.setItem(POLICY_KEY, next);
    update({ policy: next });
    await patch({ dmPolicy: next });
  } catch (err) {
    // A failed save from a previous account must not revert the new account's policy.
    if (isCurrent()) {
      try {
        localStorage.setItem(POLICY_KEY, prev);
      } catch {
        /* The in-memory preference still rolls back if local storage is unavailable. */
      }
      update({ policy: prev });
    }
    throw err;
  }
}
