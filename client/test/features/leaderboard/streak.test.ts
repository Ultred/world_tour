import { beforeEach, describe, expect, it } from "vitest";
import { registerSolve, resetStreak, streak } from "../../../src/features/leaderboard/streak";

describe("streak", () => {
  beforeEach(() => resetStreak());

  it("returns 1x on the first solve", () => {
    expect(registerSolve(1_000)).toBe(1);
    expect(streak.count).toBe(1);
  });

  it("escalates through the tier table as solves land within the window", () => {
    registerSolve(1_000); // count 1 -> 1x
    expect(registerSolve(3_000)).toBe(1); // count 2, still within 8s -> 1x
    expect(registerSolve(5_000)).toBe(1.5); // count 3 -> 1.5x
    expect(registerSolve(7_000)).toBe(1.5); // count 4 -> still 1.5x
    expect(registerSolve(9_000)).toBe(2); // count 5 -> 2x
  });

  it("resets to a fresh streak of 1 if the gap exceeds windowMs", () => {
    registerSolve(1_000);
    registerSolve(3_000);
    expect(streak.count).toBe(2);
    expect(registerSolve(3_000 + 8_001)).toBe(1); // just past the 8s window
    expect(streak.count).toBe(1);
  });

  it("resetStreak zeroes everything", () => {
    registerSolve(1_000);
    registerSolve(3_000);
    resetStreak();
    expect(streak).toEqual({ count: 0, multiplier: 1, lastSolveAt: 0 });
  });
});
