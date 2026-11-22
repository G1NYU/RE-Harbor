import { useT } from "@/lib/i18n";

export function DmUnreadBadge({
  count,
  compact = false,
  className = "",
}: {
  count: number;
  compact?: boolean;
  className?: string;
}) {
  const t = useT();
  if (count <= 0) return null;
  return (
    <span
      aria-label={t("{count} unread messages", { count })}
      className={`inline-flex w-max shrink-0 items-center justify-center whitespace-nowrap rounded-full bg-red-700 font-normal leading-none text-white ${compact ? "h-3.5 min-w-3.5 px-1 text-[10px]" : "h-[18px] min-w-[18px] px-1.5 text-[11px]"} ${className}`}
      style={{
        fontFamily: '"Inter", system-ui, sans-serif',
        fontFeatureSettings: "normal",
        textRendering: "auto",
      }}
    >
      <span dir="ltr">{count > 99 ? "99+" : count}</span>
    </span>
  );
}
