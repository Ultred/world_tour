/**
 * Shared, stream-wide combo: any viewer's organic guess keeps it alive, not a per-player
 * streak — matches how a TikTok LIVE chat behaves collectively. See WORD_TOUR_PROTOTYPE.md's
 * "Streaks & combos" backlog entry (section 9).
 */
export const STREAK = {
  /** A solve must land within this long of the previous one to extend the streak. */
  windowMs: 8000,
  /** Checked from the highest `min` down, same idiom as server/giftMap.ts's GIFT_TIERS. */
  tiers: [
    { min: 5, multiplier: 2 },
    { min: 3, multiplier: 1.5 },
    { min: 1, multiplier: 1 },
  ] as const,
};

export interface StreakState {
  count: number;
  multiplier: number;
  lastSolveAt: number;
}

export const streak: StreakState = { count: 0, multiplier: 1, lastSolveAt: 0 };

function multiplierForCount(count: number): number {
  for (const tier of STREAK.tiers) if (count >= tier.min) return tier.multiplier;
  return 1;
}

/**
 * Call once per organic correct guess (board word or bonus word) — never for a gift-forced
 * reveal. Advances the streak if within `windowMs` of the previous solve, otherwise starts a
 * fresh one at 1. Returns the multiplier to apply to THIS solve's points.
 */
export function registerSolve(now = Date.now()): number {
  streak.count = now - streak.lastSolveAt <= STREAK.windowMs ? streak.count + 1 : 1;
  streak.lastSolveAt = now;
  streak.multiplier = multiplierForCount(streak.count);
  return streak.multiplier;
}

/**
 * Deliberately NOT called on every new round — a hot streak now carries across a board
 * transition on its own, decaying only via the window in `registerSolve`. Called only by the
 * explicit "Reset Leaderboard" action (dev/testPanel.ts, main.ts), which wipes the streak
 * alongside scores since it's the same on-screen leaderboard-area state.
 */
export function resetStreak(): void {
  streak.count = 0;
  streak.multiplier = 1;
  streak.lastSolveAt = 0;
}
