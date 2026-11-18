import { useEffect, useState } from "react";
import { useT } from "@/lib/i18n";
import { loadTrackLyrics, lyricIndexAt, type LyricLine } from "@/lib/music/lyrics";
import type { MusicTrack } from "@/lib/music/types";

export function VoidLyrics({ track, seconds }: { track: MusicTrack; seconds: number }) {
  const t = useT();
  const [lines, setLines] = useState<LyricLine[] | null>(null);
  useEffect(() => {
    let active = true;
    setLines(null);
    void loadTrackLyrics(track).then(
      (value) => {
        if (active) setLines(value ?? []);
      },
      () => {
        if (active) setLines([]);
      },
    );
    return () => {
      active = false;
    };
  }, [track]);
  if (lines === null) return <p role="status">{t("Loading lyrics")}</p>;
  if (!lines.length) return <p>{t("No lyrics available")}</p>;
  const current = lyricIndexAt(lines, seconds);
  return (
    <div className="void-lyrics" aria-label={t("Lyrics")}>
      {lines.map((line, index) => (
        <p key={index} aria-current={index === current || undefined}>
          {line.text}
        </p>
      ))}
    </div>
  );
}
