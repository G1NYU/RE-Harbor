/** Play a local custom DM alert when set, otherwise use Harbor's short chime. */
import { currentDmCustomSound, currentDmCustomSoundVolume } from "./dm-preferences";

let ctx: AudioContext | null = null;
let customAudio: HTMLAudioElement | null = null;
let customAudioUrl: string | null = null;

export function playDmChime(): void {
  if (typeof window === "undefined") return;

  const customSound = currentDmCustomSound();
  if (customSound) {
    try {
      if (!customAudio) customAudio = new Audio();
      if (customAudioUrl !== customSound.dataUrl) {
        customAudio.pause();
        customAudio.src = customSound.dataUrl;
        customAudioUrl = customSound.dataUrl;
      }
      customAudio.currentTime = 0;
      customAudio.volume = currentDmCustomSoundVolume() / 100;
      void customAudio.play().catch(() => playDefaultChime());
      return;
    } catch {
      playDefaultChime();
      return;
    }
  }

  playDefaultChime();
}

function playDefaultChime(): void {
  try {
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    if (!ctx) ctx = new Ctor();
    if (ctx.state === "suspended") void ctx.resume();
    const t0 = ctx.currentTime;
    const master = ctx.createGain();
    master.gain.value = 0.05;
    master.connect(ctx.destination);
    for (const [freq, delay] of [
      [880, 0],
      [1174.66, 0.08],
    ] as const) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, t0 + delay);
      gain.gain.setValueAtTime(0, t0 + delay);
      gain.gain.linearRampToValueAtTime(1, t0 + delay + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + delay + 0.24);
      osc.connect(gain).connect(master);
      osc.start(t0 + delay);
      osc.stop(t0 + delay + 0.26);
    }
  } catch {
    /* Audio may be blocked until the first gesture; the unread badge still updates. */
  }
}
