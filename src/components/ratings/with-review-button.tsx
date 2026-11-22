import { WrittenReviewIcon } from "@/components/icons/written-review-icon";
import { useT } from "@/lib/i18n";

export function WithReviewButton({
  pressed,
  onToggle,
}: {
  pressed: boolean;
  onToggle: () => void;
}) {
  const t = useT();
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={pressed}
      title={t("Only ratings that include a written review")}
      className={`inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-[12px] font-medium transition-colors ${pressed ? "bg-ink text-canvas" : "bg-elevated/60 text-ink-muted hover:text-ink"}`}
    >
      <WrittenReviewIcon />
      {t("With review")}
    </button>
  );
}
