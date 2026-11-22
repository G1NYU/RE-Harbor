export function dmClock(iso: string | undefined): string {
  const at = Date.parse(iso ?? "");
  if (!at) return "";
  return new Date(at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function dmWhen(iso: string | undefined): string {
  const at = Date.parse(iso ?? "");
  if (!at) return "";
  const date = new Date(at);
  const now = new Date();
  if (date.toDateString() === now.toDateString()) return dmClock(iso);
  if (date.getFullYear() === now.getFullYear()) {
    return date.toLocaleDateString([], { month: "short", day: "numeric" });
  }
  return date.toLocaleDateString([], { year: "numeric", month: "short", day: "numeric" });
}

export function dmDay(iso: string | undefined): string {
  const at = Date.parse(iso ?? "");
  if (!at) return "";
  const date = new Date(at);
  const now = new Date();
  if (date.toDateString() === now.toDateString()) return "Today";
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
  return date.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
}

export function dmPreview(body: string | undefined, fallback = ""): string {
  const text = (body ?? "").replace(/\s+/g, " ").trim();
  return text || fallback;
}
