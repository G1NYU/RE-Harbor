import type { ReactNode } from "react";
import { Eye } from "lucide-react";
import { useT } from "@/lib/i18n";

export function ReviewSpoiler({
  hidden,
  onReveal,
  children,
}: {
  hidden: boolean;
  onReveal: () => void;
  children: ReactNode;
}) {
  const t = useT();
  if (!hidden) return children;

  return (
    <div className="relative min-h-10 overflow-hidden rounded-lg">
      <div aria-hidden="true" className="pointer-events-none select-none blur-[8px]">
        {children}
      </div>
      <button
        type="button"
        onClick={onReveal}
        className="absolute inset-0 flex items-center justify-center gap-1.5 bg-canvas/65 px-2 text-center text-[12px] font-semibold text-ink transition-colors hover:bg-canvas/50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
      >
        <Eye aria-hidden="true" size={13} className="shrink-0" />
        {t("Contains spoilers — show review")}
      </button>
    </div>
  );
}
