import { state } from "../../game/state";
import type { Player } from "../../game/types";

/** Bump this if `Player`'s shape ever changes incompatibly, so old saved data is ignored instead of crashing. */
const STORAGE_KEY = "wordtour.players.v1";

/** Snapshots lifetime scores to localStorage — the score-persistence decision for now (server-side authority is a bigger follow-up). */
export function saveScores(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.players));
  } catch {
    // Storage full/unavailable (private browsing, quota, etc.) — scores just won't survive a reload this session.
  }
}

/** Restores lifetime scores at startup, before the first `renderLeaderboard()` call. */
export function loadScores(): void {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const saved = JSON.parse(raw) as Record<string, Player>;
    if (saved && typeof saved === "object") state.players = saved;
  } catch {
    // Corrupt or unreadable — start fresh rather than crash the page.
  }
}

/** Wipes every player's lifetime score, both in memory and from localStorage — the dev panel's "Reset Leaderboard" button (dev/testPanel.ts). */
export function clearScores(): void {
  state.players = {};
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage unavailable — nothing to clean up.
  }
}
