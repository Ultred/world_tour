import { beforeEach, describe, expect, it } from "vitest";
import { clearScores, loadScores, saveScores } from "../../../src/features/leaderboard/persistence";
import { state } from "../../../src/game/state";

describe("persistence", () => {
  beforeEach(() => {
    localStorage.clear();
    state.players = {};
  });

  it("round-trips lifetime scores through localStorage", () => {
    state.players = { p1: { id: "p1", name: "Alex", fullName: "Alex", score: 42, color: "hsl(0,0%,0%)" } };
    saveScores();
    state.players = {};
    loadScores();
    expect(state.players.p1?.score).toBe(42);
    expect(state.players.p1?.name).toBe("Alex");
  });

  it("leaves state.players untouched when nothing was saved", () => {
    loadScores();
    expect(state.players).toEqual({});
  });

  it("does not throw on corrupt saved data", () => {
    localStorage.setItem("wordtour.players.v1", "{not valid json");
    expect(() => loadScores()).not.toThrow();
    expect(state.players).toEqual({});
  });

  it("clearScores wipes players in memory and from localStorage", () => {
    state.players = { p1: { id: "p1", name: "Alex", fullName: "Alex", score: 42, color: "hsl(0,0%,0%)" } };
    saveScores();
    clearScores();
    expect(state.players).toEqual({});
    loadScores(); // confirms nothing survived in storage to reload
    expect(state.players).toEqual({});
  });
});
