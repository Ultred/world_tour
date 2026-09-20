import { LAYOUT_ATTEMPTS, LIMIT_TIERS } from "../../core/config";
import type { Direction, Layout, LayoutCellInfo, PlacedWord } from "../../game/types";

const key = (x: number, y: number): string => `${x},${y}`;

/** Source of randomness for layout search — swap in a seeded generator for reproducible output. */
export type Rng = () => number;

/** Seeded RNG (also used by the offline level generator, WORD_TOUR_PROTOTYPE.md section 6.5) — same seed always produces the same sequence. */
export const mulberry32 = (a: number): Rng => {
  let state = a;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

/** Turns a string into a stable numeric seed for `mulberry32` — used to make a level's layout
 * a pure function of its id, so a moderator's broadcast view (`?obs=1`, see main.ts/progression.ts)
 * computes the exact same crossword layout independently, with nothing needing to be broadcast
 * beyond the level itself. */
export const hashSeed = (s: string): number => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0;
  return h;
};

/**
 * Builds one random candidate crossword: places the longest word first as the
 * spine, then randomly places the rest, each required to cross something
 * already on the board (standard crossword rules — matching letters only at
 * crossings, no side-by-side touching tiles, no collinear overlap).
 */
export function buildLayoutAttempt(
  words: string[],
  limits: { cols: number; rows: number },
  rnd: Rng = Math.random,
): Layout {
  const cells = new Map<string, LayoutCellInfo>();
  const placed: PlacedWord[] = [];
  let minX = 0, maxX = 0, minY = 0, maxY = 0;

  function put(word: string, sx: number, sy: number, dir: Direction): void {
    const dx = dir === "H" ? 1 : 0, dy = dir === "V" ? 1 : 0;
    for (let i = 0; i < word.length; i++) {
      const k = key(sx + dx * i, sy + dy * i);
      let c = cells.get(k);
      if (!c) {
        c = { ch: word[i]!, dirs: new Set() };
        cells.set(k, c);
      }
      c.dirs.add(dir);
    }
    const ex = sx + dx * (word.length - 1), ey = sy + dy * (word.length - 1);
    minX = Math.min(minX, sx); maxX = Math.max(maxX, ex);
    minY = Math.min(minY, sy); maxY = Math.max(maxY, ey);
    placed.push({ word, x: sx, y: sy, dir });
  }

  function crossingsIfValid(word: string, sx: number, sy: number, dir: Direction): number {
    const dx = dir === "H" ? 1 : 0, dy = dir === "V" ? 1 : 0, px = dy, py = dx;
    if (cells.has(key(sx - dx, sy - dy))) return -1;
    if (cells.has(key(sx + dx * word.length, sy + dy * word.length))) return -1;
    let crossings = 0;
    for (let i = 0; i < word.length; i++) {
      const x = sx + dx * i, y = sy + dy * i;
      const c = cells.get(key(x, y));
      if (c) {
        if (c.ch !== word[i] || c.dirs.has(dir)) return -1;
        crossings++;
      } else if (cells.has(key(x + px, y + py)) || cells.has(key(x - px, y - py))) {
        return -1;
      }
    }
    return crossings > 0 ? crossings : -1;
  }

  function fitsLimits(word: string, sx: number, sy: number, dir: Direction): boolean {
    const ex = dir === "H" ? sx + word.length - 1 : sx;
    const ey = dir === "V" ? sy + word.length - 1 : sy;
    return (
      Math.max(maxX, ex) - Math.min(minX, sx) + 1 <= limits.cols &&
      Math.max(maxY, ey) - Math.min(minY, sy) + 1 <= limits.rows
    );
  }

  put(words[0]!, 0, 0, "H"); // longest word = the spine, placed first

  // The rest go in random order; each must cross something already on the board.
  const queue = words.slice(1).sort(() => rnd() - 0.5);
  let stuck = 0;
  while (queue.length && stuck <= queue.length) {
    const word = queue.shift()!;
    const options: { sx: number; sy: number; dir: Direction; n: number }[] = [];
    for (const [k, c] of cells) {
      const [cx, cy] = k.split(",").map(Number) as [number, number];
      for (let i = 0; i < word.length; i++) {
        if (word[i] !== c.ch) continue;
        for (const dir of ["H", "V"] as const) {
          if (c.dirs.has(dir)) continue;
          const sx = dir === "H" ? cx - i : cx, sy = dir === "V" ? cy - i : cy;
          if (!fitsLimits(word, sx, sy, dir)) continue;
          const n = crossingsIfValid(word, sx, sy, dir);
          if (n > 0) options.push({ sx, sy, dir, n });
        }
      }
    }
    if (!options.length) {
      queue.push(word); // retry after others are placed
      stuck++;
      continue;
    }
    stuck = 0;
    const best = Math.max(...options.map((o) => o.n));
    const pool = rnd() < 0.7 ? options.filter((o) => o.n === best) : options;
    const o = pool[Math.floor(rnd() * pool.length)]!;
    put(word, o.sx, o.sy, o.dir);
  }

  return {
    placed,
    cells,
    minX,
    maxX,
    minY,
    maxY,
    cols: maxX - minX + 1,
    rows: maxY - minY + 1,
    missing: queue.length,
  };
}

export function scoreLayout(L: Layout): number {
  const area = L.cols * L.rows;
  let crossings = 0;
  L.cells.forEach((c) => {
    if (c.dirs.size === 2) crossings++;
  });

  let s = 0;
  s += (L.cells.size / area) * 40; // dense = tiles look connected, no holes
  s += crossings * 2; // more intersections
  s -= Math.max(0, L.rows - L.cols) * 3; // prefer wide over tall
  s -= Math.max(0, L.cols - L.rows * 2.2) * 2; // ...but not a flat strip

  const spine = L.placed[0]!;
  if (spine.y === L.maxY) s += 6; // spine on the bottom row
  else if (spine.y === L.minY) s += 2;

  // Reward words attached straight to the spine; penalise vertical "tails"
  // that hang past their last crossing.
  const spineCells = new Set<string>();
  for (let i = 0; i < spine.word.length; i++) spineCells.add(key(spine.x + i, spine.y));
  for (const p of L.placed.slice(1)) {
    const dx = p.dir === "H" ? 1 : 0, dy = p.dir === "V" ? 1 : 0;
    let last = -1;
    let touchesSpine = false;
    for (let i = 0; i < p.word.length; i++) {
      const k = key(p.x + dx * i, p.y + dy * i);
      if (L.cells.get(k)!.dirs.size === 2) last = i;
      if (spineCells.has(k)) touchesSpine = true;
    }
    if (touchesSpine) s += 1.5;
    if (p.dir === "V") s -= 3 * (p.word.length - 1 - last);
  }
  return s;
}

/**
 * Pure crossword layout search — no DOM, no game state. Used by both the live
 * game (via `game/levelSetup.ts`, default `Math.random`) and the offline level
 * generator (`scripts/`, seeded `rnd` for reproducible output).
 */
export function buildBestLayout(words: string[], rnd: Rng = Math.random): Layout {
  const sorted = [...words].sort((a, b) => b.length - a.length);
  let best: Layout | null = null;
  for (const limits of LIMIT_TIERS) {
    for (let n = 0; n < LAYOUT_ATTEMPTS; n++) {
      const L = buildLayoutAttempt(sorted, limits, rnd);
      if (L.missing) continue;
      L.score = scoreLayout(L);
      if (!best || L.score > best.score!) best = L;
    }
    if (best) break; // found a full layout at this size
  }
  if (!best) {
    // last resort: most words placed
    const lastTier = LIMIT_TIERS[LIMIT_TIERS.length - 1]!;
    for (let n = 0; n < LAYOUT_ATTEMPTS; n++) {
      const L = buildLayoutAttempt(sorted, lastTier, rnd);
      if (!best || L.missing < best.missing) best = L;
    }
    if (!best) throw new Error("buildBestLayout: LAYOUT_ATTEMPTS produced no candidates");
    best.score = scoreLayout(best);
  }
  // Normalise so the top-left tile is (0,0)
  best.words = best.placed.map((p) => ({ word: p.word, dir: p.dir, startX: p.x - best.minX, startY: p.y - best.minY }));
  return best;
}
