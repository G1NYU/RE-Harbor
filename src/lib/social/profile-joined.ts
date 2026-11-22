/** Calendar date from the real server timestamp, using the viewer's timezone. */
export function formatProfileJoinedAt(
  value: string | null | undefined,
  locale: string,
  timeZone?: string,
): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime()) || date.getTime() <= 0) return null;
  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "long",
    day: "numeric",
    ...(timeZone ? { timeZone } : {}),
  }).format(date);
}
