import { useEffect, useRef } from "react";
import { BookmarkCheck, Check, Download, Heart, ListVideo, Play, X } from "lucide-react";
import "./title-tools.css";

type VoidTitleToolsProps = {
  name: string;
  isMovie: boolean;
  isWatched: boolean;
  isFavorite: boolean;
  showWatched: boolean;
  onClose: () => void;
  onChooseSource: () => void;
  onDownload: () => void;
  onToggleWatched: () => void;
  onToggleFavorite: () => void;
  onAdvanced: () => void;
};

/** VOID's own title actions. Existing Harbor controllers perform the actual mutations. */
export function VoidTitleTools({
  name,
  isMovie,
  isWatched,
  isFavorite,
  showWatched,
  onClose,
  onChooseSource,
  onDownload,
  onToggleWatched,
  onToggleFavorite,
  onAdvanced,
}: VoidTitleToolsProps) {
  const panel = useRef<HTMLElement>(null);
  const dismiss = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dismiss.current?.focus();
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }
      if (event.key !== "Tab") return;
      const buttons = panel.current?.querySelectorAll<HTMLButtonElement>("button:not([disabled])");
      if (!buttons?.length) return;
      const first = buttons[0];
      const last = buttons[buttons.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleKey, true);
    return () => {
      document.removeEventListener("keydown", handleKey, true);
      if (previous?.isConnected) previous.focus();
    };
  }, [onClose]);

  const run = (action: () => void) => {
    onClose();
    action();
  };

  return (
    <div className="void-title-tools-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <aside ref={panel} className="void-title-tools-panel" role="dialog" aria-modal="true" aria-label="Title actions">
        <header className="void-title-tools-head">
          <div>
            <span>VOID / TITLE CONTROLS</span>
            <h2>What next?</h2>
            <p>{name}</p>
          </div>
          <button ref={dismiss} type="button" data-tv-modal-close onClick={onClose} aria-label="Close title actions">
            <X size={20} />
          </button>
        </header>
        <div className="void-title-tools-actions">
          <button type="button" className="void-title-tools-highlight" onClick={() => run(onChooseSource)}>
            <Play size={20} />
            <span><strong>Choose a source</strong><small>Browse available playback options</small></span>
          </button>
          <button type="button" aria-pressed={isFavorite} onClick={onToggleFavorite}>
            <Heart size={20} fill={isFavorite ? "currentColor" : "none"} />
            <span><strong>{isFavorite ? "Remove favorite" : "Add to favorites"}</strong><small>Keep this title close</small></span>
            {isFavorite && <Check size={17} />}
          </button>
          {isMovie && showWatched && (
            <button type="button" aria-pressed={isWatched} onClick={onToggleWatched}>
              <BookmarkCheck size={20} />
              <span><strong>{isWatched ? "Mark as unwatched" : "Mark as watched"}</strong><small>Update your existing tracking services</small></span>
              {isWatched && <Check size={17} />}
            </button>
          )}
          {isMovie && (
            <button type="button" onClick={() => run(onDownload)}>
              <Download size={20} />
              <span><strong>Download a copy</strong><small>Use Harbor's existing download engine</small></span>
            </button>
          )}
        </div>
        <div className="void-title-tools-footer">
          <p>Additional sync, trailer, list and provider tools remain accessible during the redesign.</p>
          <button type="button" onClick={() => run(onAdvanced)}>
            <ListVideo size={17} /> Open remaining tools
          </button>
        </div>
      </aside>
    </div>
  );
}
