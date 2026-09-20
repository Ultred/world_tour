import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TikTokUser } from "../../../../shared/types";
import { handleGuess } from "../../../src/features/board/guess";
import { awardPoints, isPlaying, remainingMs, round, roundDurationMs, runOrBuffer, setPaused, tickRound, TIMER } from "../../../src/features/round/round";
import { getPlayer, state } from "../../../src/game/state";

const fakeUser = (id: string): TikTokUser => ({ id, uniqueId: id, nickname: id });

describe("roundDurationMs", () => {
  it("follows the plan's base + perWord*count formula", () => {
    expect(roundDurationMs(0)).toBe(TIMER.baseSec * 1000);
    expect(roundDurationMs(7)).toBe((TIMER.baseSec + TIMER.perWordSec * 7) * 1000);
  });
});

describe("remainingMs / isPlaying", () => {
  it("is 0 outside the 'playing' phase, regardless of a stale deadline", () => {
    round.deadline = Date.now() + 999_999;
    round.phase = "intro";
    expect(remainingMs()).toBe(0);
    round.phase = "summary";
    expect(remainingMs()).toBe(0);
  });

  it("counts down to the deadline and clamps at 0 past it", () => {
    const now = 1_000_000;
    round.phase = "playing";
    round.deadline = now + 5000;
    expect(remainingMs(now)).toBe(5000);
    expect(remainingMs(now + 3000)).toBe(2000);
    expect(remainingMs(now + 9000)).toBe(0);
  });

  it("isPlaying() reflects the current phase", () => {
    round.phase = "playing";
    expect(isPlaying()).toBe(true);
    round.phase = "timeUp";
    expect(isPlaying()).toBe(false);
  });
});

describe("tickRound phase transition", () => {
  // endRoundByTime() schedules a stageLater callback that eventually touches the
  // DOM (showTimeUpBanner). Fake timers keep it from ever actually firing here —
  // we only assert the synchronous phase flip, not the render side effect.
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("stays 'playing' within the grace window past the deadline", () => {
    round.phase = "playing";
    round.deadline = 1_000_000;
    tickRound(1_000_000 + TIMER.graceMs - 1);
    expect(round.phase).toBe("playing");
  });

  it("flips to 'timeUp' once the grace window has also elapsed", () => {
    round.phase = "playing";
    round.deadline = 1_000_000;
    tickRound(1_000_000 + TIMER.graceMs + 1);
    expect(round.phase).toBe("timeUp");
  });

  it("does nothing outside the 'playing' phase", () => {
    round.phase = "summary";
    round.deadline = 1_000_000;
    tickRound(1_000_000 + 999_999);
    expect(round.phase).toBe("summary");
  });
});

describe("pause / resume", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    setPaused(false); // don't leak pause state into other tests
    vi.useRealTimers();
  });

  it("freezes remainingMs at the instant pause began, instead of letting it keep counting down", () => {
    vi.setSystemTime(1_000_000);
    round.phase = "playing";
    round.deadline = 1_000_000 + 10_000;
    expect(remainingMs()).toBe(10_000);

    setPaused(true);
    vi.setSystemTime(1_000_000 + 4_000); // 4s pass while paused
    expect(remainingMs()).toBe(10_000); // still frozen, not 6_000
  });

  it("shifts the deadline forward by the paused duration on resume, so no round time is lost", () => {
    vi.setSystemTime(1_000_000);
    round.phase = "playing";
    round.deadline = 1_000_000 + 10_000;

    setPaused(true);
    vi.setSystemTime(1_000_000 + 4_000); // paused for 4s
    setPaused(false);

    expect(remainingMs()).toBe(10_000); // unchanged right after resuming
    vi.setSystemTime(1_000_000 + 4_000 + 3_000); // 3s of real play after resuming
    expect(remainingMs()).toBe(7_000);
  });
});

describe("awardPoints", () => {
  it("adds to both lifetime score and this round's score together", () => {
    round.roundScores = new Map();
    const user = fakeUser("award-test-player");
    const before = getPlayer(user).score;
    awardPoints(user, 5);
    expect(getPlayer(user).score).toBe(before + 5);
    expect(round.roundScores.get(user.id)).toBe(5);

    awardPoints(user, 3);
    expect(round.roundScores.get(user.id)).toBe(8);
    expect(getPlayer(user).score).toBe(before + 8);
  });
});

describe("runOrBuffer", () => {
  it("runs the action immediately while a round is playing", () => {
    round.phase = "playing";
    let ran = false;
    runOrBuffer(() => {
      ran = true;
    });
    expect(ran).toBe(true);
  });

  it("does not run the action outside the 'playing' phase", () => {
    round.phase = "intro";
    let ran = false;
    runOrBuffer(() => {
      ran = true;
    });
    expect(ran).toBe(false);
  });
});

describe("handleGuess gating on round phase", () => {
  beforeEach(() => {
    state.wordPlacements = {
      CAT: {
        startX: 0,
        startY: 0,
        dir: "H",
        cells: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }],
        solved: false,
        solvedBy: null,
      },
    };
    state.grid = [[null, null, null]];
    state.solvedCount = 0;
  });

  it("ignores a guess entirely when the round is not in the 'playing' phase", () => {
    round.phase = "intro";
    handleGuess(fakeUser("alex"), "CAT");
    expect(state.wordPlacements.CAT!.solved).toBe(false);
    expect(state.solvedCount).toBe(0);
  });
});
