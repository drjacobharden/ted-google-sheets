export type TreemapGrowthTone =
  | "growth-neutral"
  | "growth-positive-0"
  | "growth-positive-1"
  | "growth-positive-2"
  | "growth-positive-3"
  | "growth-negative-0"
  | "growth-negative-1"
  | "growth-negative-2"
  | "growth-negative-3";

/** Maps year-over-year growth to four ordered intensity levels. */
export function treemapGrowthTone(growth: number | null): TreemapGrowthTone {
  if (growth === null || (!Number.isFinite(growth) && growth !== Number.POSITIVE_INFINITY)) {
    return "growth-neutral";
  }

  const magnitude = Math.abs(growth);
  const level = magnitude >= 25 ? 3 : magnitude >= 15 ? 2 : magnitude >= 5 ? 1 : 0;
  return growth < 0 ? `growth-negative-${level}` : `growth-positive-${level}`;
}
