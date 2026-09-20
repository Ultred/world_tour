import { describe, expect, it } from "vitest";
import { QUESTIONS, triviaBag } from "../../../src/features/trivia";
import { parseAnswerIndex } from "../../../src/features/trivia/trivia";

// Quality gates checked against the actual shipped trivia.generated.json, so a bad
// re-generation fails CI instead of only showing up on stream — mirrors levels.test.ts.
describe("generated trivia library quality gates", () => {
  it("has at least 150 questions", () => {
    expect(QUESTIONS.length).toBeGreaterThanOrEqual(150);
  });

  it("every question has exactly 4 choices with a valid correctIndex pointing at its own word", () => {
    for (const q of QUESTIONS) {
      expect(q.choices).toHaveLength(4);
      expect(q.correctIndex).toBeGreaterThanOrEqual(0);
      expect(q.correctIndex).toBeLessThan(4);
      expect(q.choices[q.correctIndex]).toBe(q.word);
    }
  });

  it("no two choices within a question are the same word", () => {
    for (const q of QUESTIONS) {
      expect(new Set(q.choices).size).toBe(4);
    }
  });

  it("the definition never contains the answer word itself", () => {
    for (const q of QUESTIONS) {
      expect(q.definition.toUpperCase()).not.toContain(q.word);
    }
  });

  it("has no duplicate answer words across the set", () => {
    const words = QUESTIONS.map((q) => q.word);
    expect(new Set(words).size).toBe(words.length);
  });
});

describe("triviaBag", () => {
  it("plays through every question once before repeating", () => {
    const seen = new Set<string>();
    for (let i = 0; i < QUESTIONS.length; i++) {
      const q = triviaBag.next();
      expect(seen.has(q.word)).toBe(false);
      seen.add(q.word);
    }
    expect(seen.size).toBe(QUESTIONS.length);
  });
});

describe("parseAnswerIndex", () => {
  it("parses bare letters A-D, case-insensitively", () => {
    expect(parseAnswerIndex("a")).toBe(0);
    expect(parseAnswerIndex("B")).toBe(1);
    expect(parseAnswerIndex("c")).toBe(2);
    expect(parseAnswerIndex("D")).toBe(3);
  });

  it("parses digits 1-4 as the same 0-based index", () => {
    expect(parseAnswerIndex("1")).toBe(0);
    expect(parseAnswerIndex("4")).toBe(3);
  });

  it("tolerates leading punctuation before the letter", () => {
    expect(parseAnswerIndex("a)")).toBe(0);
    expect(parseAnswerIndex("!C!")).toBe(2);
  });

  it("returns null for text that isn't a recognizable answer", () => {
    expect(parseAnswerIndex("lol nice")).toBe(null);
    expect(parseAnswerIndex("5")).toBe(null);
    expect(parseAnswerIndex("")).toBe(null);
  });
});
