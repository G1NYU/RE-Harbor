import { useT, useUiLanguage } from "@/lib/i18n";
import { formatProfileJoinedAt } from "@/lib/social/profile-joined";

export function ProfileJoinedAt({
  value,
  show = true,
  className = "",
}: {
  value?: string;
  show?: boolean;
  className?: string;
}) {
  const t = useT();
  const locale = useUiLanguage();
  const formatted = formatProfileJoinedAt(value, locale);
  if (!show || !formatted) return null;
  return (
    <time dateTime={value} className={className}>
      {t("Joined {date}", { date: formatted })}
    </time>
  );
}
