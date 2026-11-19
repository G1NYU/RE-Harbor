import type { NavCustomization, NavItemId } from "./nav-items";

/** The original VOID sections, before any user-defined tab ordering. */
export const VOID_DEFAULT_NAV_ORDER: NavItemId[] = [
  "home", "discover", "catalogs",
  "movies", "shows", "anime", "live", "sports", "vod", "kids",
  "manga", "ebook",
  "music", "games",
  "library", "downloads", "calendar", "collections",
  "addons", "plugins", "settings",
];

/** User customizations always win; the old grouping is only the VOID default. */
export function withVoidDefaultNavOrder(cfg: NavCustomization): NavCustomization {
  return cfg.order.length ? cfg : { ...cfg, order: VOID_DEFAULT_NAV_ORDER };
}

const SECTION_BY_TAB: Partial<Record<NavItemId, string>> = {
  movies: "Watch", shows: "Watch", anime: "Watch", kids: "Watch",
  live: "Watch", sports: "Watch", vod: "Watch",
  manga: "Read", ebook: "Read",
  music: "Listen & Play", games: "Listen & Play",
  library: "Yours", downloads: "Yours", calendar: "Yours", collections: "Yours",
  addons: "More", plugins: "More", settings: "More",
};

/**
 * Keep section dividers stable even after arbitrary cross-category tab moves.
 * Count only available, visible tabs to avoid empty or duplicate headings.
 */
export function voidNavSectionBoundaries(visibleOrder: NavItemId[]) {
  const available = new Set(visibleOrder);
  const headings: { index: number; label: string }[] = [];
  let index = 0;
  let previous: string | undefined;
  for (const id of VOID_DEFAULT_NAV_ORDER) {
    if (!available.has(id)) continue;
    const section = SECTION_BY_TAB[id];
    if (section && section !== previous) headings.push({ index, label: section });
    previous = section;
    index += 1;
  }
  return headings;
}
