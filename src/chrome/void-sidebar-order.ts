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
