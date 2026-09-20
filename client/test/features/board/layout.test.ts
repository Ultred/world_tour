import { describe, expect, it } from "vitest";
import { buildBestLayout, hashSeed, mulberry32 } from "../../../src/features/board/layout";

// Fixed word sets, independent of whatever the level generator produces — layout.ts
// is pure crossword-placement logic and shouldn't need to know where words came from.
const WORD_SETS = [
  ["TRAIN", "STAIR", "RAT", "TIN", "AIR", "ANT"],
  ["CRATE", "STARE", "CARS", "ACTS", "RATE", "CAT"],
  ["PLANET", "PLANE", "PLANT", "PLATE", "LEAP", "PAL"],
];

describe("buildBestLayout", () => {
  it("places every word from each set with no missing words", () => {
    for (const words of WORD_SETS) {
      const layout = buildBestLayout(words);
      expect(layout.missing).toBe(0);
      expect(layout.words).toHaveLength(words.length);
      // Every word from the input must appear exactly once in the placed layout.
      const placedWords = layout.words!.map((w) => w.word).sort();
      expect(placedWords).toEqual([...words].sort());
    }
  });

  it("normalises placements so the top-left tile is (0,0)", () => {
    const layout = buildBestLayout(WORD_SETS[0]!);
    const minX = Math.min(...layout.words!.map((w) => w.startX));
    const minY = Math.min(...layout.words!.map((w) => w.startY));
    expect(minX).toBe(0);
    expect(minY).toBe(0);
  });

  it("crops the board to its bounding box (cols/rows match the placed extent)", () => {
    const layout = buildBestLayout(WORD_SETS[2]!);
    let maxX = 0, maxY = 0;
    for (const w of layout.words!) {
      const endX = w.dir === "H" ? w.startX + w.word.length - 1 : w.startX;
      const endY = w.dir === "V" ? w.startY + w.word.length - 1 : w.startY;
      maxX = Math.max(maxX, endX);
      maxY = Math.max(maxY, endY);
    }
    expect(layout.cols).toBe(maxX + 1);
    expect(layout.rows).toBe(maxY + 1);
  });

  it("is reproducible when given a seeded RNG", () => {
    // Simple deterministic LCG, good enough to prove reproducibility here.
    const makeRng = (seed: number) => {
      let s = seed;
      return () => ((s = (s * 1103515245 + 12345) & 0x7fffffff), s / 0x7fffffff);
    };
    const words = WORD_SETS[1]!;
    const a = buildBestLayout(words, makeRng(7));
    const b = buildBestLayout(words, makeRng(7));
    expect(a.words).toEqual(b.words);
  });

  it("lays out identically for two independent calls given the same level id (levelSetup.ts's seed)", () => {
    // This is the exact mechanism that keeps the ?obs=1 broadcast view's board in sync with
    // the control tab's — both compute this independently from the same broadcast Level, with
    // no layout data itself ever sent over the wire.
    const words = WORD_SETS[2]!;
    const a = buildBestLayout(words, mulberry32(hashSeed("L0042")));
    const b = buildBestLayout(words, mulberry32(hashSeed("L0042")));
    expect(a.words).toEqual(b.words);
  });
});
