import type { Level } from "../../../../shared/types";
import { audio } from "../../audio";
import { TRIVIA_CHANCE } from "../../core/config";
import { log } from "../../dev/log";
import { renderWordList } from "../../dev/wordList";
import { emitToServer } from "../../core/net";
import { state } from "../../game/state";
import { cancelStage } from "../board/celebrations";
import { setupLevel } from "../board/levelSetup";
import { pickModifierForLevel, refreshGoldenCell, setActiveModifier, shrinkForSpeedRound } from "../round/modifiers";
import { startRound } from "../round/round";
import { startTriviaInterlude } from "../trivia/trivia";
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
  const picked = levelBag.next();
  const modifier = pickModifierForLevel(picked);
  // Speed Round trims the board down to short words before layout is built (not after) — the
  // shrunk level is what actually gets broadcast, so the ?obs=1 view never sees the full board.
  const level = modifier.modifier === "speed" ? shrinkForSpeedRound(picked) : picked;
  state.currentLevel = level;
  setupLevel(level);
  setActiveModifier(modifier);
  refreshGoldenCell(); // needs state.wordPlacements, which setupLevel() just built
  renderWordList(); // dev-panel convenience — never shown on the ?obs=1 broadcast view (panel hidden there)
  log(`🆕 New Board started (${level.id}, D${level.difficulty}, letters: ${level.letters.join(" ")})`, "ev-board");
  const deadline = startRound(advanceToNextBoard); // itself is "what happens after this round's summary" — round.ts never imports this module
  emitToServer({ type: "board", level, deadline }); // tells the ?obs=1 broadcast view to mirror this exact board
}

/**
 * What happens after a round's summary finishes: usually just the next board, but sometimes
 * (see `TRIVIA_CHANCE`) a short A/B/C/D trivia interlude runs first — see features/trivia/trivia.ts.
 * Only ever reached on the control tab (same as `newBoard` itself).
 */
function advanceToNextBoard(): void {
  if (Math.random() < TRIVIA_CHANCE) startTriviaInterlude(newBoard);
  else newBoard();
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
  setActiveModifier(pickModifierForLevel(level));
  refreshGoldenCell(); // needs state.wordPlacements, which setupLevel() just built
  log(`🆕 New Board (mirrored): ${level.id}, D${level.difficulty}, letters: ${level.letters.join(" ")}`, "ev-board");
  startRound(() => {}, deadline);
}
