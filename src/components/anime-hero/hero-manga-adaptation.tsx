import { useEffect, useState } from "react";
import type { Meta } from "@/lib/cinemeta";
import { useT } from "@/lib/i18n";
import { resolveAnimeSourceReading, type AnimeReadingSource } from "@/lib/manga/anime-adaptation";
import { useView } from "@/lib/view";

export function HeroMangaAdaptation({ meta }: { meta: Meta }) {
  const t = useT();
  const { openEBook, openManga } = useView();
  const [source, setSource] = useState<AnimeReadingSource | null>(null);

  useEffect(() => {
    let cancelled = false;
    setSource(null);
    resolveAnimeSourceReading(meta.id, meta.malId, meta.name)
      .then((resolved) => {
        if (!cancelled) setSource(resolved);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [meta.id, meta.malId, meta.name]);

  if (!source) return null;
  const { kind, node } = source;

  const open = async () => {
    if (kind === "ebook") {
      const { ebookDetail } = await import("@/lib/ebook/api");
      const ebook = await ebookDetail(`anilist:${node.anilistId}`).catch(() => null);
      openEBook(ebook?.id ?? `anilist:${node.anilistId}`);
      return;
    }
    const { searchManga } = await import("@/lib/manga/api");
    const found = (await searchManga(node.title, 0).catch(() => []))[0];
    openManga(found?.id);
  };

  return (
    <button
      type="button"
      onClick={open}
      title={node.title}
      className="group flex max-w-full items-center gap-3 rounded-lg px-1 py-1 text-start hover:bg-elevated focus-visible:outline-2 focus-visible:outline-accent"
    >
      {node.poster && (
        <img
          src={node.poster}
          alt=""
          className="h-12 w-[34px] shrink-0 rounded-md object-cover shadow-[0_3px_12px_rgba(0,0,0,0.6)]"
        />
      )}
      <div className="flex min-w-0 flex-col items-start">
        <span className="text-[12px] font-semibold text-ink-muted">
          {t(kind === "ebook" ? "Read the eBook" : "Read the Manga")}
        </span>
        <span className="line-clamp-2 max-w-[28ch] break-words text-sm font-semibold leading-snug text-ink">
          {node.title}
        </span>
      </div>
    </button>
  );
}
