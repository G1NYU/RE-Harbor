/**
 * Comparing two written reviews without inventing opinions.
 *
 * The only claims this module can make are about text that is literally present in both
 * reviews and about the two numbers. It does not label sentiment, guess whether a reviewer
 * liked something, or paraphrase: terms are quoted as text differences, not interpreted.
 * The match score stays numeric-only, as specified.
 */

const STOPWORDS = new Set([
  "this",
  "that",
  "these",
  "those",
  "with",
  "from",
  "they",
  "them",
  "their",
  "there",
  "about",
  "which",
  "would",
  "could",
  "should",
  "really",
  "very",
  "just",
  "like",
  "have",
  "been",
  "were",
  "what",
  "when",
  "your",
  "make",
  "made",
  "more",
  "much",
  "also",
  "than",
  "then",
  "into",
  "over",
  "only",
  "some",
  "such",
  "even",
  "still",
  "because",
  "being",
  "after",
  "before",
  "while",
  "where",
  "here",
  "does",
  "didn",
  "wasn",
  "isn",
  "aren",
  "give",
  "gave",
  "goes",
  "going",
  "well",
  "good",
  "much",
]);

function words(text: string): string[] {
  return (text.toLowerCase().match(/[a-z0-9']+/g) ?? []).filter(
    (word) => word.length >= 4 && !/^\d+$/.test(word) && !STOPWORDS.has(word),
  );
}

/**
 * Words that appear in both reviews. Ordered by how often the pair uses them, then
 * alphabetically, so the list is stable for the same two texts.
 */
export function sharedTerms(
  mine: string | null | undefined,
  theirs: string | null | undefined,
  limit = 6,
): string[] {
  if (!mine || !theirs) return [];
  const a = words(mine);
  const b = new Set(words(theirs));
  const counts = new Map<string, number>();
  for (const word of a) {
    if (!b.has(word)) continue;
    counts.set(word, (counts.get(word) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((x, y) => (y[1] === x[1] ? x[0].localeCompare(y[0]) : y[1] - x[1]))
    .slice(0, Math.max(0, limit))
    .map(([word]) => word);
}

/** Frequent informative words found only on one side; these are text differences, not opinions. */
export function uniqueTerms(
  text: string | null | undefined,
  other: string | null | undefined,
  limit = 6,
): string[] {
  if (!text || !other) return [];
  const otherWords = new Set(words(other));
  const counts = new Map<string, number>();
  for (const word of words(text)) {
    if (otherWords.has(word)) continue;
    counts.set(word, (counts.get(word) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((x, y) => (y[1] === x[1] ? x[0].localeCompare(y[0]) : y[1] - x[1]))
    .slice(0, Math.max(0, limit))
    .map(([word]) => word);
}

/** A factual sentence about who wrote what, never about what they meant. */
export function reviewPresence(
  mine: string | null | undefined,
  theirs: string | null | undefined,
): "both" | "mine-only" | "theirs-only" | "neither" {
  const hasMine = !!(mine && mine.trim());
  const hasTheirs = !!(theirs && theirs.trim());
  if (hasMine && hasTheirs) return "both";
  if (hasMine) return "mine-only";
  if (hasTheirs) return "theirs-only";
  return "neither";
}
