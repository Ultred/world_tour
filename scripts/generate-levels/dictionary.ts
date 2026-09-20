import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import wordListPath from "word-list";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

export interface DictWord {
  /** Uppercase, A-Z only. */
  w: string;
  /** 0 = most common. */
  rank: number;
  /** 26-length letter-count vector, A=0..Z=25 — for fast "does this fit in this pool" checks. */
  c: number[];
}

const VALID_WORD_RE = /^[A-Z]{3,7}$/;

function letterCounts(word: string): number[] {
  const counts = new Array<number>(26).fill(0);
  for (const ch of word) {
    const i = ch.charCodeAt(0) - 65;
    counts[i] = (counts[i] ?? 0) + 1;
  }
  return counts;
}

function loadBlocklist(): Set<string> {
  const raw = readFileSync(path.join(__dirname, "blocklist.txt"), "utf8");
  const words = raw
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => line.toUpperCase());
  return new Set(words);
}

/** word-list: ~275k valid English words (MIT), one per line, lowercase. Used as the "is this a real word" gate. */
function loadValidWords(): Set<string> {
  const raw = readFileSync(wordListPath, "utf8");
  const set = new Set<string>();
  for (const line of raw.split("\n")) {
    const w = line.trim().toUpperCase();
    if (VALID_WORD_RE.test(w)) set.add(w);
  }
  return set;
}

/**
 * subtlex-word-frequencies (ISC): 74,286 words ranked by real spoken-English
 * frequency (SUBTLEXus movie-subtitle corpus, Ghent University). Words
 * capitalized in the source are dropped as likely proper nouns (character
 * names are extremely common in subtitle corpora) — see the README for the
 * "capitalized = skews capitalized in the corpus" convention this relies on.
 */
function loadFrequencyRanked(): { word: string; count: number }[] {
  const data = require("subtlex-word-frequencies") as { word: string; count: number }[];
  const byWord = new Map<string, number>();
  for (const entry of data) {
    if (/^[A-Z]/.test(entry.word)) continue; // capitalized in the corpus — likely a proper noun
    const w = entry.word.toUpperCase();
    if (!VALID_WORD_RE.test(w)) continue;
    byWord.set(w, Math.max(byWord.get(w) ?? 0, entry.count)); // dedupe case variants, keep the higher count
  }
  return [...byWord.entries()]
    .map(([word, count]) => ({ word, count }))
    .sort((a, b) => b.count - a.count);
}

/**
 * Loads, cleans, and ranks the dictionary: intersects the frequency list with
 * the validity list, drops blocklisted words, and assigns a 0-based rank
 * (0 = most common) — matches WORD_TOUR_PROTOTYPE.md section 6.4 step 1.
 */
export function loadDictionary(): DictWord[] {
  const valid = loadValidWords();
  const blocked = loadBlocklist();
  const ranked = loadFrequencyRanked();

  const out: DictWord[] = [];
  let rank = 0;
  for (const { word } of ranked) {
    if (!valid.has(word)) continue;
    if (blocked.has(word)) continue;
    out.push({ w: word, rank: rank++, c: letterCounts(word) });
  }
  return out;
}
