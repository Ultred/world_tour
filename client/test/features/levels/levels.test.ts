import { describe, expect, it } from "vitest";
import { canFormFromPool, LEVELS } from "../../../src/features/levels";

describe("canFormFromPool", () => {
  it("accepts a word fully covered by the pool, respecting letter counts", () => {
    expect(canFormFromPool("CAT", ["C", "A", "T", "S"])).toBe(true);
  });

  it("rejects a word needing more of a letter than the pool has", () => {
    expect(canFormFromPool("CATS", ["C", "A", "T"])).toBe(false); // only 3 letters for a 4-letter word
    expect(canFormFromPool("TATS", ["T", "A", "S"])).toBe(false); // needs two Ts, pool has one
  });

  it("rejects a word containing a letter absent from the pool", () => {
    expect(canFormFromPool("DOG", ["C", "A", "T"])).toBe(false);
  });
});

// Quality gates from WORD_TOUR_PROTOTYPE.md section 6.8 — checked against the
// actual shipped levels.generated.json, so a bad re-generation fails CI
// instead of only showing up on stream.
describe("generated level library quality gates", () => {
  it("has at least 500 levels", () => {
    expect(LEVELS.length).toBeGreaterThanOrEqual(500);
  });

  it("every board word is formable from that level's own letters", () => {
    for (const level of LEVELS) {
      for (const word of level.words) {
        expect(canFormFromPool(word, level.letters)).toBe(true);
      }
    }
  });

  it("the featured word is the longest board word and is 5-7 letters", () => {
    for (const level of LEVELS) {
      const longest = [...level.words].sort((a, b) => b.length - a.length)[0];
      expect(level.featured).toBe(longest);
      expect(level.featured.length).toBeGreaterThanOrEqual(5);
      expect(level.featured.length).toBeLessThanOrEqual(7);
    }
  });

  it("every level has at least 5 bonus words", () => {
    for (const level of LEVELS) {
      expect(level.bonusWords.length).toBeGreaterThanOrEqual(5);
    }
  });

  it("board words and bonus words never overlap within a level", () => {
    for (const level of LEVELS) {
      const board = new Set(level.words);
      for (const bonus of level.bonusWords) {
        expect(board.has(bonus)).toBe(false);
      }
    }
  });

  it("has no duplicate level ids", () => {
    const ids = LEVELS.map((l) => l.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("has no two levels with the same letter pool and word list", () => {
    const signatures = LEVELS.map((l) => `${[...l.letters].sort().join("")}:${[...l.words].sort().join(",")}`);
    expect(new Set(signatures).size).toBe(signatures.length);
  });

  it("difficulty counts match the generator's target distribution", () => {
    const counts = new Map<number, number>();
    for (const level of LEVELS) counts.set(level.difficulty, (counts.get(level.difficulty) ?? 0) + 1);
    for (let d = 1; d <= 5; d++) expect(counts.get(d)).toBe(100);
  });
});
