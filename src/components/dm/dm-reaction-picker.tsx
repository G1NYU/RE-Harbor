import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { SmilePlus } from "lucide-react";
import { useT } from "@/lib/i18n";

const REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🎉"];

export function DmReactionPicker({ onPick }: { onPick: (emoji: string) => void }) {
  const t = useT();
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const width = 232;
  const height = 48;

  useEffect(() => {
    if (!position) return;
    panel.current?.querySelector<HTMLButtonElement>("button")?.focus();
    const outside = (event: PointerEvent) => {
      if (
        !panel.current?.contains(event.target as Node) &&
        !trigger.current?.contains(event.target as Node)
      )
        setPosition(null);
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        setPosition(null);
        trigger.current?.focus();
      }
    };
    const close = () => setPosition(null);
    const blur = (event: FocusEvent) => {
      if (
        !panel.current?.contains(event.target as Node) &&
        !trigger.current?.contains(event.target as Node)
      )
        close();
    };
    document.addEventListener("pointerdown", outside, true);
    document.addEventListener("focusin", blur);
    document.addEventListener("keydown", key, true);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true);
    return () => {
      document.removeEventListener("pointerdown", outside, true);
      document.removeEventListener("focusin", blur);
      document.removeEventListener("keydown", key, true);
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [position]);

  return (
    <>
      <button
        ref={trigger}
        type="button"
        aria-label={t("React")}
        title={t("React")}
        aria-haspopup="dialog"
        aria-expanded={!!position}
        onClick={() => {
          if (position) {
            setPosition(null);
            return;
          }
          const rect = trigger.current!.getBoundingClientRect();
          setPosition({
            left: Math.max(8, Math.min(rect.right - width, window.innerWidth - width - 8)),
            top: Math.max(8, Math.min(rect.top - height - 8, window.innerHeight - height - 8)),
          });
        }}
        className="grid h-5 w-5 place-items-center rounded-full hover:bg-elevated hover:text-ink"
      >
        <SmilePlus size={13} aria-hidden />
      </button>
      {position &&
        createPortal(
          <div
            ref={panel}
            role="dialog"
            aria-label={t("Choose a reaction")}
            className="fixed z-[260] flex items-center justify-center gap-1 overflow-hidden rounded-full bg-elevated p-1.5 shadow-xl ring-1 ring-edge-soft"
            style={{ ...position, width, height }}
          >
            {REACTIONS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                aria-label={t("React with {emoji}", { emoji })}
                title={t("React with {emoji}", { emoji })}
                className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-xl transition-colors hover:bg-raised focus-visible:bg-raised"
                onClick={() => {
                  setPosition(null);
                  trigger.current?.focus();
                  onPick(emoji);
                }}
              >
                {emoji}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}
