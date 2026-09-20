import levelsData from "./levels.generated.json";
import { levelBag } from "./levelBag";
import type { Level } from "./types";

export type { Difficulty, Level } from "./types";
export { levelBag } from "./levelBag";

/** 500 levels generated offline by `scripts/generate-levels/` — see its report.md for generation stats. */
export const LEVELS: Level[] = levelsData as Level[];

levelBag.load(LEVELS);

export function canFormFromPool(word: string, pool: readonly string[]): boolean {
  const counts: Record<string, number> = {};
  for (const l of pool) counts[l] = (counts[l] ?? 0) + 1;
  for (const ch of word) {
    if (!counts[ch]) return false;
    counts[ch]--;
  }
  return true;
}
