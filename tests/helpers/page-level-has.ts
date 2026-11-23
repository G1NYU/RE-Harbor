/**
 * Finds CSS selectors that ask a :has() question of the whole page.
 *
 * While such a rule applies and its answer is "no", Chromium marks the whole document and re-checks
 * it for nodes that are added or removed. With the invalidation set that all :has() rules share,
 * each re-check restyles the page, and cards scrolling into view are enough to trigger it. Measured
 * on a release build with a single added rule, style recalculation while scrolling Home:
 *   html:has(.never) body {}            16.6 % of main-thread time (1.4 % without the rule)
 *   body:has(.never) #root {}           15.9 %
 *   html:has(> body > .never) body {}    1.3 %   (direct children only: cheap, not reported)
 *
 * Reported: a selector in which html, body or :root (also inside :is() / :where()) carries a :has()
 * that looks deeper than direct children, with nothing but such page compounds before it. A first
 * compound without tag, class or id ("*", a bare :has(), attributes only) matches html and body too
 * and is reported the same way. Nested rules are resolved against their parents first.
 *
 * Not covered: a class or id that happens to sit on html or body (".dark:has(.x)"), and @scope roots.
 */
export function pageLevelHasSelectors(css: string): string[] {
  const found: string[] = [];
  for (const selector of resolvedSelectors(css)) {
    if (!/:has\(/i.test(selector)) continue;
    const compounds = splitTopLevel(selector.toLowerCase(), isCombinator);
    for (const [index, compound] of compounds.entries()) {
      const named = namesPage(compound);
      if (!named && !(index === 0 && isBare(compound))) break;
      if (asksDeeperThanChildren(compound)) {
        found.push(selector);
        break;
      }
      // A bare compound that asks nothing says nothing about the page either.
      if (!named) break;
    }
  }
  return found;
}

const isCombinator = (ch: string) => ch === " " || ch === ">" || ch === "+" || ch === "~";
const isComma = (ch: string) => ch === ",";

/** Splits at the given characters, but never inside (), [] or quotes. */
function splitTopLevel(text: string, at: (ch: string) => boolean): string[] {
  const parts: string[] = [];
  let depth = 0;
  let quote = "";
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quote) {
      if (ch === "\\") i += 1;
      else if (ch === quote) quote = "";
      continue;
    }
    if (ch === '"' || ch === "'") quote = ch;
    else if (ch === "\\") i += 1;
    else if (ch === "(" || ch === "[") depth += 1;
    else if (ch === ")" || ch === "]") depth -= 1;
    else if (depth === 0 && at(ch)) {
      parts.push(text.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(text.slice(start));
  return parts.map((part) => part.trim()).filter(Boolean);
}

/** The text between the bracket at `open` and its partner. */
function insideParens(text: string, open: number): string {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === "(") depth += 1;
    else if (text[i] === ")" && --depth === 0) return text.slice(open + 1, i);
  }
  return text.slice(open + 1);
}

/** The compound with everything inside () and [] removed, so only its own parts are left. */
function ownParts(compound: string): string {
  let out = "";
  let depth = 0;
  for (const ch of compound) {
    if (ch === "(" || ch === "[") depth += 1;
    else if (ch === ")" || ch === "]") depth -= 1;
    else if (depth === 0) out += ch;
  }
  return out;
}

/** html, body or :root, written out or as an argument of the compound's own :is() / :where(). */
function namesPage(compound: string): boolean {
  if (/^(?:html|body)(?![\w-])/.test(compound) || /:root(?![\w-])/.test(ownParts(compound))) {
    return true;
  }
  let depth = 0;
  for (let i = 0; i < compound.length; i++) {
    const ch = compound[i];
    if (ch === "[") depth += 1;
    else if (ch === "]") depth -= 1;
    else if (ch === "(") {
      if (depth === 0 && /:(?:is|where)$/.test(compound.slice(0, i))) {
        for (const argument of splitTopLevel(insideParens(compound, i), isComma)) {
          const last = splitTopLevel(argument, isCombinator).pop();
          if (last && namesPage(last)) return true;
        }
      }
      depth += 1;
    } else if (ch === ")") depth -= 1;
  }
  return false;
}

/** No tag, class or id of its own: "*", a bare :has(), attributes or pseudo-classes only. */
function isBare(compound: string): boolean {
  const own = ownParts(compound);
  return !/^[a-z]/.test(own) && !/[.#]/.test(own);
}

/** Does any :has() in this compound look further than direct children ("> a > b")? */
function asksDeeperThanChildren(compound: string): boolean {
  for (const match of compound.matchAll(/:has\(/g)) {
    const inner = insideParens(compound, match.index + match[0].length - 1);
    for (const argument of splitTopLevel(inner, isComma)) {
      if (!argument.startsWith(">")) return true;
      const steps = argument.replace(/\s*>\s*/g, ">");
      if (splitTopLevel(steps, (ch) => ch === " " || ch === "+" || ch === "~").length > 1)
        return true;
    }
  }
  return false;
}

/** Every style rule's selectors, with nested rules joined to their parents. */
function resolvedSelectors(css: string): string[] {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, " ");
  const out: string[] = [];
  // One entry per open block: the selectors it stands for, or null for an at-rule.
  const stack: (string[] | null)[] = [];
  let start = 0;
  let depth = 0;
  let quote = "";
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quote) {
      if (ch === "\\") i += 1;
      else if (ch === quote) quote = "";
      continue;
    }
    if (ch === '"' || ch === "'") quote = ch;
    else if (ch === "\\") i += 1;
    else if (ch === "(" || ch === "[") depth += 1;
    else if (ch === ")" || ch === "]") depth -= 1;
    else if (depth > 0) continue;
    else if (ch === ";") start = i + 1;
    else if (ch === "}") {
      stack.pop();
      start = i + 1;
    } else if (ch === "{") {
      const prelude = text.slice(start, i).trim();
      start = i + 1;
      if (!prelude || prelude.startsWith("@")) {
        stack.push(null);
        continue;
      }
      const parents = [...stack].reverse().find((entry) => entry !== null) ?? null;
      const own = splitTopLevel(prelude, isComma).map((part) => part.replace(/\s+/g, " "));
      const resolved = parents
        ? own.flatMap((child) => parents.map((parent) => nest(parent, child)))
        : own;
      stack.push(resolved);
      out.push(...resolved);
    }
  }
  return out;
}

function nest(parent: string, child: string): string {
  return child.includes("&") ? child.replaceAll("&", parent) : `${parent} ${child}`;
}
