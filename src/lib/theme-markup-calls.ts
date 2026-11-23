/**
 * The app's CSP has no script-src-attr allowance, so an inline event handler in theme markup never
 * runs in a release build. The chrome builder, the cheat-sheet recipe and Feishin all wire their
 * buttons as onclick="window.harbor.navigate('home')". That one shape is read here so the click can
 * be honoured without running any markup code: a single call of one of the click actions below, with
 * no argument, one quoted string, or `this` (the element itself).
 */
const HARBOR_CALL =
  /^\s*(?:window\.)?harbor\.([A-Za-z]+)\(\s*(?:'([^'\\]*)'|"([^"\\]*)"|(this))?\s*\)\s*;?\s*$/;

/** The window.harbor functions the Theme Studio cheat sheet documents as click actions. */
const CLICK_ACTIONS = new Set([
  "navigate",
  "back",
  "search",
  "openSettings",
  "openNotifications",
  "openAccountMenu",
  "bigPicture",
  "viewMyProfile",
  "tryViewMyProfile",
]);

/** `text` is a quoted string argument; `element` stands for a bare `this`. At most one is set. */
export type HarborCall = { method: string; text?: string; element?: true };

export function parseHarborCall(code: string | null | undefined): HarborCall | null {
  const match = code ? HARBOR_CALL.exec(code) : null;
  if (!match || !CLICK_ACTIONS.has(match[1])) return null;
  if (match[4]) return { method: match[1], element: true };
  const text = match[2] ?? match[3];
  return text === undefined ? { method: match[1] } : { method: match[1], text };
}

/**
 * Runs the window.harbor call of a clicked theme element whose inline handler the CSP blocked.
 * `markupRoot` is the node that holds theme and custom HTML; nothing outside it is honoured.
 */
export function runBlockedHarborCall(target: Element, markupRoot: Element): boolean {
  const el = target.closest<HTMLElement>("[onclick]");
  // A handler the browser accepted runs by itself; a blocked one leaves the property null.
  if (!el || el.onclick !== null || !markupRoot.contains(el)) return false;
  const call = parseHarborCall(el.getAttribute("onclick"));
  const api = (window as unknown as { harbor?: Record<string, unknown> }).harbor;
  if (!call || !api || !Object.hasOwn(api, call.method)) return false;
  const method = api[call.method];
  if (typeof method !== "function") return false;
  if (call.element) method.call(api, el);
  else if (call.text !== undefined) method.call(api, call.text);
  else method.call(api);
  return true;
}
