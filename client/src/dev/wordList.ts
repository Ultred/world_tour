import { dom } from "../core/dom";
import { state } from "../game/state";

/**
 * Shows the current board's words in the dev panel — a testing convenience so you don't have
 * to go spelunking in `levels.generated.json` to know what to type. Not part of the video
 * frame, and never called on the `?obs=1` broadcast view (its dev panel is hidden entirely).
 */
export function renderWordList(): void {
  const level = state.currentLevel;
  dom.boardWordsList.textContent = level ? level.words.join(", ") : "—";
  dom.bonusWordsList.textContent = level?.bonusWords.length ? level.bonusWords.join(", ") : "—";
}
