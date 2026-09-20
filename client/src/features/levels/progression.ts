import type { Level } from "../../../../shared/types";
import { audio } from "../../audio";
import { log } from "../../dev/log";
import { emitToServer } from "../../core/net";
import { state } from "../../game/state";
import { cancelStage } from "../board/celebrations";
import { setupLevel } from "../board/levelSetup";
import { startRound } from "../round/round";
import { levelBag } from "./index";

/**
 * Board progression: each board now runs a timed round (see WORD_TOUR_PROTOTYPE.md section 7)
 * — advances on full solve OR the clock running out. Only ever called by the moderator's
 * control tab (the plain, non-`?obs=1` view) — the `?obs=1` broadcast view mirrors boards via
 * `applyBoardBroadcast` instead, never picking its own level.
 */
export function newBoard(): void {
  cancelStage(); // also cancels any pending round timer from the previous board (shares the stageTimers queue)
  audio.newBoard();
  state.boardComplete = false;
  const level = levelBag.next();
  state.currentLevel = level;
  setupLevel(level);
  log(`🆕 New Board started (${level.id}, D${level.difficulty}, letters: ${level.letters.join(" ")})`, "ev-board");
  const deadline = startRound(newBoard); // itself is "what happens after this round's summary" — round.ts never imports this module
  emitToServer({ type: "board", level, deadline }); // tells the ?obs=1 broadcast view to mirror this exact board
}

/**
 * Broadcast-view-only counterpart to `newBoard` — applies a board the control tab published
 * instead of picking one locally, so the `?obs=1` view always shows the exact same board and
 * countdown the moderator does. Never drives its own progression: `onEnd` is a no-op, since the
 * *next* board also arrives as a broadcast, not a local decision.
 */
export function applyBoardBroadcast(level: Level, deadline: number): void {
  cancelStage();
  state.boardComplete = false;
  state.currentLevel = level;
  setupLevel(level);
  log(`🆕 New Board (mirrored): ${level.id}, D${level.difficulty}, letters: ${level.letters.join(" ")}`, "ev-board");
  startRound(() => {}, deadline);
}
