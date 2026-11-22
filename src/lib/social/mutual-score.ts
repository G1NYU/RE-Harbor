export type MutualScoreTone = { text: string; ring: string; fill: string; label: string };

/** Colour bands for the match percentage shown on a full profile. */
export function mutualScoreTone(score: number): MutualScoreTone {
  if (score < 40)
    return {
      text: "text-red-400",
      ring: "ring-red-400/40",
      fill: "bg-red-500",
      label: "Very different tastes",
    };
  if (score < 60)
    return {
      text: "text-orange-400",
      ring: "ring-orange-400/40",
      fill: "bg-orange-500",
      label: "Limited similarity",
    };
  if (score < 75)
    return {
      text: "text-yellow-400",
      ring: "ring-yellow-400/40",
      fill: "bg-yellow-500",
      label: "Somewhat similar",
    };
  if (score < 90)
    return {
      text: "text-lime-400",
      ring: "ring-lime-400/40",
      fill: "bg-lime-500",
      label: "Strong similarity",
    };
  return {
    text: "text-emerald-400",
    ring: "ring-emerald-400/40",
    fill: "bg-emerald-500",
    label: "Extremely similar",
  };
}
export type MutualMatch = { score: number | null; count: number };
