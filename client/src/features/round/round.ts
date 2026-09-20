import type { TikTokUser } from "../../../../shared/types";
import { audio } from "../../audio";
import { log } from "../../dev/log";
import { getPlayer, state, stageLater } from "../../game/state";
import { saveScores } from "../leaderboard/persistence";
import {
  hideIntro,
  hideRoundSummary,
  hideTimeUpBanner,
  paintTimerBar,
  showIntro,
  showRoundSummary,
  showTimeUpBanner,
  type TimerColorState,
} from "./roundHud";

// See WORD_TOUR_PROTOTYPE.md section 7 — proposed defaults, tune after playtesting.
export const TIMER = {
  introMs: 3000,
  /** Flat 3-minute round by default. `perWordSec` is kept at 0 (not removed) so
   * per-word scaling is a one-line change once the level library (varying word
   * counts) ships — see the dev-panel override below for testing other lengths meanwhile. */
  baseSec: 180,
  perWordSec: 0,
  /** Last N seconds: pulsing HUD + tick sound. */
  warnSec: 10,
  /** Accepts a guess/power-up up to this long after the deadline, for parity with
   * the plan's "TikTok event arrived late but was sent before the deadline" case —
   * there's no network timestamp to compare against yet (test panel is synchronous),
   * so this is applied as a flat grace window on the local clock instead. */
  graceMs: 1200,
  summaryMs: 5000,
  timeUpBannerMs: 1800,
  /** Gifts arriving between rounds are buffered and replayed at the next 'playing'
   * phase so a gifter never loses their gift; capped so a spam burst can't grow forever. */
  maxBufferedPowerUps: 5,
} as const;

// Dev-only override so a round's length can be changed for testing without touching
// code. `null` = use the TIMER formula above. Takes effect starting the *next* round
// (startRound), not retroactively on one already in progress.
let durationOverrideSec: number | null = null;

export function setDurationOverrideSec(sec: number | null): void {
  durationOverrideSec = sec != null && sec > 0 ? sec : null;
}

export function getDurationOverrideSec(): number | null {
  return durationOverrideSec;
}

export const roundDurationMs = (wordCount: number): number =>
  (durationOverrideSec ?? TIMER.baseSec + TIMER.perWordSec * wordCount) * 1000;

export type RoundPhase = "intro" | "playing" | "timeUp" | "complete" | "summary";

export interface RoundState {
  phase: RoundPhase;
  durationMs: number;
  /** Absolute `Date.now()`-based deadline; 0 while not playing. */
  deadline: number;
  /** Points earned this round only, separate from lifetime score — keyed by player name. */
  roundScores: Map<string, number>;
}

export const round: RoundState = {
  phase: "intro",
  durationMs: 0,
  deadline: 0,
  roundScores: new Map(),
};

export function isPlaying(): boolean {
  return round.phase === "playing";
}

/** ms remaining, for the HUD — 0 outside the 'playing' phase. Frozen at the instant pause began while paused. */
export function remainingMs(now = Date.now()): number {
  if (round.phase !== "playing") return 0;
  const effectiveNow = paused && pausedAt != null ? pausedAt : now;
  return Math.max(0, round.deadline - effectiveNow);
}

/** Awards lifetime score AND this round's score in one place, so callers never update one and forget the other. */
export function awardPoints(user: TikTokUser, points: number): void {
  const player = getPlayer(user);
  player.score += points;
  round.roundScores.set(player.id, (round.roundScores.get(player.id) ?? 0) + points);
  saveScores(); // localStorage snapshot so a reloaded overlay doesn't lose lifetime scores
}

// ============ Dev-only pause (section 7.3: "Pause exists only in the dev panel; the live game never pauses.") ============
let paused = false;
// Date.now() when the pause was switched on — freezes the HUD at this instant instead of
// letting it keep counting down, and lets us shift `round.deadline` forward on resume so
// the paused duration isn't silently lost from the round's remaining time.
let pausedAt: number | null = null;

export const isPaused = (): boolean => paused;

export const setPaused = (p: boolean): void => {
  if (p === paused) return;
  paused = p;
  if (paused) {
    pausedAt = Date.now();
  } else if (pausedAt != null) {
    const pausedDurationMs = Date.now() - pausedAt;
    if (round.phase === "playing") round.deadline += pausedDurationMs;
    pausedAt = null;
  }
};

// ============ Buffered power-ups: gifts that arrive outside 'playing' ============
let bufferedPowerUps: (() => void)[] = [];

/** Runs `action` now if a round is in progress, else queues it for the moment the next round begins. */
export function runOrBuffer(action: () => void): void {
  if (isPlaying()) {
    action();
    return;
  }
  bufferedPowerUps.push(action);
  if (bufferedPowerUps.length > TIMER.maxBufferedPowerUps) bufferedPowerUps.shift(); // drop the oldest, keep the most recent
}

function drainBufferedPowerUps(): void {
  if (!bufferedPowerUps.length) return;
  const actions = bufferedPowerUps;
  bufferedPowerUps = [];
  actions.forEach((fn) => fn());
}

// ============ Lifecycle ============
let onRoundEndCallback: (() => void) | null = null;
let lastTickSecond = -1;

/**
 * Begins a round for the board that was just set up: a brief "GET READY" intro,
 * then the countdown starts. `onEnd` is called once the round's summary has
 * finished showing — the caller (progression.ts's `newBoard`) passes itself so
 * this module never needs to import progression.ts back (would be a cycle).
 *
 * `deadline`, if given, is an already-decided absolute round-end timestamp (from the
 * moderator's `BoardEvent` broadcast — see progression.ts's `applyBoardBroadcast`) so the
 * `?obs=1` broadcast view reaches "playing" in lockstep with the control tab instead of
 * computing its own `introMs`-from-now deadline. Omit it to compute one fresh (the normal,
 * control-tab path). Either way, returns the deadline actually used, so the control tab can
 * publish exactly what it decided.
 */
export function startRound(onEnd: () => void, deadline?: number): number {
  const wordCount = Object.keys(state.wordPlacements).length;
  const durationMs = roundDurationMs(wordCount);
  const resolvedDeadline = deadline ?? Date.now() + TIMER.introMs + durationMs;

  round.phase = "intro";
  round.durationMs = durationMs;
  round.deadline = 0;
  round.roundScores = new Map();
  // Deliberately NOT resetting the streak here: it now carries across a board transition on
  // its own — the streak's own 8s window (features/leaderboard/streak.ts) is the only thing
  // that ever expires it, so a hot streak survives into a new board if the next guess lands
  // quickly, and fades on its own if viewers are slow, with no special-casing for round boundaries.
  onRoundEndCallback = onEnd;
  lastTickSecond = -1;

  hideTimeUpBanner();
  hideRoundSummary();
  showIntro();
  stageLater(Math.max(0, resolvedDeadline - durationMs - Date.now()), () => beginPlaying(resolvedDeadline));

  return resolvedDeadline;
}

function beginPlaying(deadline: number): void {
  round.phase = "playing";
  round.deadline = deadline;
  hideIntro();
  drainBufferedPowerUps();
}

/** Called every animation frame (and by `startRoundWatchdog` below). Pure polling against the wall clock. */
export function tickRound(now = Date.now()): void {
  if (paused) return;
  if (round.phase !== "playing") return;
  if (now >= round.deadline + TIMER.graceMs) endRoundByTime();
}

/**
 * Backup heartbeat for `tickRound`, independent of `requestAnimationFrame`. Browsers fully
 * suspend rAF once a tab is hidden/backgrounded (switched away from, or an OBS setup where
 * this isn't the focused window) — without this, the round would freeze in "playing" until
 * someone brings the tab back into view. `setInterval` keeps firing (throttled to roughly
 * once a second in the background, not stopped) so the round still reaches "timeUp" and
 * advances to the next board on schedule even while nobody is looking. Safe to call alongside
 * `animLoop`'s own `tickRound` call — `tickRound` is idempotent once the phase has moved on.
 */
export function startRoundWatchdog(intervalMs = 1000): void {
  setInterval(() => tickRound(), intervalMs);
}

/** Dev-only: ends the current round on the next tick, as if the clock had just run out. */
export function forceTimeUp(): void {
  if (round.phase !== "playing") return;
  round.deadline = Date.now() - TIMER.graceMs - 1;
}

function endRoundByTime(): void {
  round.phase = "timeUp";
  // Never cut off a celebration still playing from the last word solved before the buzzer.
  const wait = Math.max(0, state.stageBusyUntil - Date.now());
  stageLater(wait, () => {
    audio.timeUp();
    revealMissedWords();
    showTimeUpBanner();
    stageLater(TIMER.timeUpBannerMs, () => {
      hideTimeUpBanner();
      finishRoundNow("timeUp");
    });
  });
}

/** Reveals every still-unsolved word's tiles as missed: dimmed, no owner, no points. */
function revealMissedWords(): void {
  const now = Date.now();
  for (const [word, placement] of Object.entries(state.wordPlacements)) {
    if (placement.solved) continue;
    placement.solved = true; // no solvedBy — nobody gets credit
    placement.cells.forEach((c, idx) => {
      if (!state.grid[c.y]?.[c.x]) {
        state.grid[c.y]![c.x] = { letter: word[idx]!, owner: null, revealAnimStart: now, missed: true };
      }
    });
  }
}

/**
 * Ends the round immediately (used when the board is fully solved — see
 * `guess.ts`'s `completeBoard`) and shows the round summary. Exported since the
 * "board complete" trigger lives outside this module.
 */
export function finishRoundNow(reason: "complete" | "timeUp"): void {
  round.phase = "summary";
  audio.roundSummary();

  const topScorers = [...round.roundScores.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([id, points]) => ({ name: state.players[id]?.name ?? id, points }));

  showRoundSummary({
    reason,
    topScorers,
    featuredWord: state.targetWord,
    solverCount: round.roundScores.size,
  });

  log(`📋 Round summary — ${topScorers.map((s) => `${s.name}:${s.points}`).join(", ") || "no scorers"}`, "ev-board");

  stageLater(TIMER.summaryMs, () => {
    hideRoundSummary();
    round.phase = "complete";
    onRoundEndCallback?.();
  });
}

/** Drives the timer HUD (bar + m:ss, colour shift, last-10s pulse + tick). Called every animation frame. */
export function renderRoundHud(now = Date.now()): void {
  if (round.phase !== "playing") {
    paintTimerBar({ visible: false, ratio: 0, label: "0:00", color: "green", pulsing: false });
    return;
  }
  const remaining = remainingMs(now);
  const ratio = round.durationMs > 0 ? remaining / round.durationMs : 0;
  const totalSec = Math.ceil(remaining / 1000);
  const mm = Math.floor(totalSec / 60);
  const ss = totalSec % 60;
  const label = `${mm}:${ss.toString().padStart(2, "0")}`;

  const color: TimerColorState = ratio > 0.5 ? "green" : ratio > 0.2 ? "amber" : "red";
  const pulsing = totalSec <= TIMER.warnSec;

  if (pulsing && totalSec !== lastTickSecond && totalSec > 0) {
    lastTickSecond = totalSec;
    audio.tick();
  }

  paintTimerBar({ visible: true, ratio, label, color, pulsing });
}
