import { buildBestLayout, mulberry32, type Rng } from "../../client/src/features/board/layout";
import type { Difficulty, Level } from "../../client/src/features/levels/types";
import type { DictWord } from "./dictionary";

export { mulberry32 };

const fits = (wc: number[], pool: number[]): boolean => wc.every((n, i) => n <= pool[i]!);
/** Strips a plural/tense suffix so e.g. PLANT and PLANTS don't both land on one board. */
const stem = (w: string): string => w.replace(/(S|ED|ING|ER)$/, "");

const CAP_PER_LENGTH: Record<number, number> = { 3: 3, 4: 4, 5: 3, 6: 2, 7: 1 };
/** Upper end of the section 6.6 ramp table's word-count range per difficulty. */
export const WORDS_PER_DIFFICULTY: Record<Difficulty, number> = { 1: 6, 2: 7, 3: 8, 4: 9, 5: 10 };
const HARD_CONSONANTS = new Set(["Q", "X", "Z", "J"]);
const VOWELS = new Set(["A", "E", "I", "O", "U"]);
const MIN_FORMABLE_WORDS = 12;

export interface Pool {
  seed: DictWord;
  /** Sorted letters — used to dedupe pools that are anagrams of each other. */
  signature: string;
}

/** Every 5–7 letter dictionary word is a candidate seed; dedupe pools that share the same letters. */
export function findPools(dict: DictWord[]): Pool[] {
  const seen = new Set<string>();
  const pools: Pool[] = [];
  for (const d of dict) {
    if (d.w.length < 5 || d.w.length > 7) continue;
    const signature = [...d.w].sort().join("");
    if (seen.has(signature)) continue;
    seen.add(signature);
    pools.push({ seed: d, signature });
  }
  return pools;
}

function formableCount(pool: DictWord, dict: DictWord[]): number {
  let n = 0;
  for (const d of dict) {
    if (d.w === pool.w) continue;
    if (fits(d.c, pool.c)) n++;
  }
  return n;
}

/** 1–4 vowels, not all-hard-consonants, at least 12 formable words — section 6.4 step 4. */
export function isPlayablePool(pool: Pool, dict: DictWord[]): boolean {
  const letters = pool.seed.w;
  const vowelCount = [...letters].filter((ch) => VOWELS.has(ch)).length;
  if (vowelCount < 1 || vowelCount > 4) return false;

  const consonants = [...letters].filter((ch) => !VOWELS.has(ch));
  if (consonants.length > 0 && consonants.every((ch) => HARD_CONSONANTS.has(ch))) return false;

  return formableCount(pool.seed, dict) >= MIN_FORMABLE_WORDS;
}

/**
 * Which difficulty tier (if any) a pool qualifies for, from its own letter
 * count and the seed's frequency rank — section 6.6's ramp table.
 */
export function pickDifficultyForPool(pool: Pool): Difficulty | null {
  const len = pool.seed.w.length;
  const rank = pool.seed.rank;
  if (len === 5) return rank < 3000 ? 1 : null;
  if (len === 6) return rank < 5000 ? 2 : rank < 8000 ? 3 : null;
  if (len === 7) return rank < 15000 ? 4 : rank < 20000 ? 5 : null;
  return null;
}

/**
 * The section 6.6 ramp table's "word commonness (frequency rank)" ceiling —
 * applies to every board word, not just the seed. Without this, a thin pool
 * could reach arbitrarily deep into the dictionary to fill out its word count,
 * surfacing genuinely obscure words (e.g. "POIS", "ORRIS") on otherwise-easy boards.
 */
const DIFFICULTY_RANK_CEILING: Record<Difficulty, number> = { 1: 3000, 2: 5000, 3: 8000, 4: 15000, 5: 20000 };

/**
 * Greedily selects board words by frequency (with seeded jitter), under
 * per-length caps and a no-near-duplicate-stems rule — section 6.5's
 * `selectBoardWords`. Strictly excludes anything rarer than `maxRank` (the
 * difficulty's commonness ceiling) — with 18,000+ candidate pools and only
 * 500 levels needed, there's no reason to ever compromise on word commonness;
 * a pool too thin to fill a board from common words alone is simply skipped
 * by the caller in favour of a different pool (see `buildLevel`).
 */
export function selectBoardWords(
  seed: DictWord,
  dict: DictWord[],
  want: number,
  rnd: Rng,
  maxRank: number,
): { words: string[]; bonusWords: string[] } {
  const candidates = dict.filter((d) => d.w.length <= seed.w.length && fits(d.c, seed.c));
  const orderedPool = candidates
    .filter((d) => d.w !== seed.w && d.rank <= maxRank)
    .sort((a, b) => a.rank - b.rank + (rnd() - 0.5) * 4000); // frequency order with jitter

  const words = [seed.w];
  const stems = new Set([stem(seed.w)]);
  const perLen: Record<number, number> = {};
  for (const d of orderedPool) {
    if (words.length >= want) break;
    const L = d.w.length;
    if ((perLen[L] ?? 0) >= (CAP_PER_LENGTH[L] ?? 2)) continue;
    if (stems.has(stem(d.w))) continue;
    words.push(d.w);
    stems.add(stem(d.w));
    perLen[L] = (perLen[L] ?? 0) + 1;
  }
  const board = new Set(words);
  const bonusWords = candidates.map((d) => d.w).filter((w) => !board.has(w));
  return { words, bonusWords };
}

/**
 * Builds one level from a seed pool, validating with `buildBestLayout` — the
 * exact same layout generator the live game uses (section 6.4 step 6). Backs
 * off the word count a few times before giving up on this pool entirely.
 */
export function buildLevel(seed: DictWord, dict: DictWord[], difficulty: Difficulty, id: string, rnd: Rng): Level | null {
  const want = WORDS_PER_DIFFICULTY[difficulty];
  const maxRank = DIFFICULTY_RANK_CEILING[difficulty];
  for (let attempt = 0; attempt < 5; attempt++) {
    const { words, bonusWords } = selectBoardWords(seed, dict, want - attempt, rnd, maxRank);
    if (words.length < 4) return null; // too few words left over to make a real board
    const layout = buildBestLayout(words, rnd);
    if (layout.missing) continue; // not every word could be placed — retry with fewer words
    return { id, seed: seed.w, difficulty, letters: [...seed.w], featured: seed.w, words, bonusWords };
  }
  return null;
}
