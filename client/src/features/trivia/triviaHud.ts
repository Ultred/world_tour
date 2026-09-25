import { dom, mk } from "../../core/dom";
import type { TriviaQuestion } from "./types";

const LETTERS = ["A", "B", "C", "D"];
/** Caps the visible name list per choice so a busy chat can't grow a choice box without bound. */
const MAX_NAMES_SHOWN = 8;

export function showTriviaCard(question: TriviaQuestion): void {
  dom.triviaDefinition.textContent = question.definition;
  dom.triviaChoices.replaceChildren(
    ...question.choices.map((word, i) => {
      const choice = mk("div", "trivia-choice");
      const top = mk("div", "trivia-choice-top");
      top.append(mk("span", "trivia-choice-letter", LETTERS[i]), mk("span", "trivia-choice-word", word));
      choice.append(top, mk("div", "trivia-choice-names"));
      return choice;
    }),
  );
  dom.triviaCard.classList.add("show");
  // Fades out the leftover crossword board/wheel/gift-guide (style.css's body.trivia-active) so
  // this reads as its own round, not a popup sitting on top of the previous one.
  document.body.classList.add("trivia-active");
}

/** Live "who picked what" — answers are held back (no scoring/correctness shown) until the
 * reveal, so this only ever shows names next to the letter someone picked, nothing else. */
export function renderTriviaAnswers(namesByChoice: string[][]): void {
  const choiceEls = [...dom.triviaChoices.children];
  namesByChoice.forEach((names, i) => {
    const namesEl = choiceEls[i]?.querySelector(".trivia-choice-names");
    if (!namesEl) return;
    const shown = names.slice(0, MAX_NAMES_SHOWN);
    const extra = names.length - shown.length;
    namesEl.textContent = shown.join(", ") + (extra > 0 ? ` +${extra} more` : "");
  });
}

/** Highlights the correct choice, dims the rest — called once the countdown ends. */
export function revealTriviaAnswer(correctIndex: number): void {
  [...dom.triviaChoices.children].forEach((el, i) => {
    el.classList.toggle("correct", i === correctIndex);
    el.classList.toggle("dim", i !== correctIndex);
  });
}

export function hideTriviaCard(): void {
  dom.triviaCard.classList.remove("show");
  document.body.classList.remove("trivia-active");
}
