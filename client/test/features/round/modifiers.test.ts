import { describe, expect, it } from "vitest";
import type { Level } from "../../../../shared/types";
import { pickModifierForLevel, ROUND_MODIFIERS, shrinkForSpeedRound } from "../../../src/features/round/modifiers";

const fakeLevel = (id: string, overrides: Partial<Level> = {}): Level => ({
  id,
  seed: "PLANET",
  difficulty: 1,
  letters: ["P", "L", "A", "N", "E", "T"],
  featured: "PLANET",
  words: ["PLANET", "PLANE", "PLANT", "PLATE", "LEAP", "PAL"],
  bonusWords: [],
  ...overrides,
});

describe("pickModifierForLevel", () => {
  it("is a pure function of the level — same input, identical output every time", () => {
    const level = fakeLevel("L0042");
    expect(pickModifierForLevel(level)).toEqual(pickModifierForLevel(level));
  });

  it("when goldenTile, picks a word from level.words and a valid index within it", () => {
    // Scan enough ids to find at least one that lands on goldenTile (deterministic per id).
    for (let i = 0; i < 200; i++) {
      const level = fakeLevel(`L${i}`);
      const result = pickModifierForLevel(level);
      if (result.modifier !== "goldenTile") continue;
      expect(level.words).toContain(result.goldenWord);
      expect(result.goldenIndex).toBeGreaterThanOrEqual(0);
      expect(result.goldenIndex).toBeLessThan(result.goldenWord!.length);
      return; // found at least one — done
    }
    throw new Error("Expected at least one of 200 level ids to land on goldenTile");
  });

  it("excludes the featured word from the golden-word pool when other words exist", () => {
    for (let i = 0; i < 200; i++) {
      const level = fakeLevel(`L${i}`);
      const result = pickModifierForLevel(level);
      if (result.modifier !== "goldenTile") continue;
      expect(result.goldenWord).not.toBe(level.featured);
    }
  });

  it("falls back to the featured word if it's the only word on the level", () => {
    for (let i = 0; i < 50; i++) {
      const result = pickModifierForLevel(fakeLevel(`SOLO${i}`, { words: ["PLANET"], featured: "PLANET" }));
      if (result.modifier === "goldenTile") expect(result.goldenWord).toBe("PLANET");
    }
  });

  it("all three modifiers are reachable across many level ids", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) {
      seen.add(pickModifierForLevel(fakeLevel(`L${i}`)).modifier!);
    }
    for (const m of ROUND_MODIFIERS) expect(seen.has(m)).toBe(true);
  });

  it("most boards roll no modifier at all — a normal round stays the common case", () => {
    let none = 0;
    const total = 400;
    for (let i = 0; i < total; i++) {
      if (pickModifierForLevel(fakeLevel(`L${i}`)).modifier === null) none++;
    }
    expect(none).toBeGreaterThan(total * 0.4); // MODIFIER_CHANCE is well under 1
  });
});

describe("shrinkForSpeedRound", () => {
  it("keeps only words under the length cap, moving the rest into bonusWords", () => {
    const level = fakeLevel("L0001", { words: ["PLANET", "PLANE", "PLANT", "PLATE", "LEAP", "PAL"], bonusWords: ["TAP"] });
    const shrunk = shrinkForSpeedRound(level);
    expect(shrunk.words).toEqual(["LEAP", "PAL"]);
    expect(shrunk.bonusWords).toEqual(["TAP", "PLANET", "PLANE", "PLANT", "PLATE"]);
  });

  it("never mutates the original level", () => {
    const level = fakeLevel("L0002");
    const before = { ...level, words: [...level.words], bonusWords: [...level.bonusWords] };
    shrinkForSpeedRound(level);
    expect(level).toEqual(before);
  });
});
