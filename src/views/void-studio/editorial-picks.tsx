import { CoverImg } from "@/components/cover-img";
import type { Meta } from "@/lib/cinemeta";
import { useView } from "@/lib/view";
import "./editorial-picks.css";

export function EditorialPicks({
  title,
  items,
  compact = false,
}: {
  title: string;
  items: Meta[];
  compact?: boolean;
}) {
  const { openMeta } = useView();
  if (!items.length) return null;
  return (
    <section className="void-edition" data-compact={compact || undefined}>
      <h1>{title}</h1>
      <div className="void-edition-picks">
        {items.slice(0, compact ? 6 : 4).map((item, index) => (
          <button type="button" key={item.id} onClick={() => openMeta(item)}>
            {(item.poster || item.background) && (
              <CoverImg
                alt=""
                src={
                  index === 0 && !compact
                    ? item.background || item.poster
                    : item.poster || item.background
                }
                decoding="async"
              />
            )}
            <span>
              <strong>{item.name}</strong>
              <small>{[item.releaseInfo, item.genres?.[0]].filter(Boolean).join(" · ")}</small>
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

type BookPick = { id: string; title: string; cover?: string; byline?: string };

export function ReadingTable({
  title,
  items,
  onOpen,
}: {
  title: string;
  items: BookPick[];
  onOpen: (id: string) => void;
}) {
  if (!items.length) return null;
  return (
    <section className="void-reading-table">
      <h1>{title}</h1>
      <div>
        {items.slice(0, 5).map((book) => (
          <button type="button" key={book.id} onClick={() => onOpen(book.id)}>
            {book.cover && <CoverImg src={book.cover} alt="" decoding="async" />}
            <strong>{book.title}</strong>
            {book.byline && <small>{book.byline}</small>}
          </button>
        ))}
      </div>
    </section>
  );
}
