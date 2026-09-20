import { dom, mk } from "../../core/dom";
import type { TriviaQuestion } from "./types";

const LETTERS = ["A", "B", "C", "D"];

export function showTriviaCard(question: TriviaQuestion): void {
  dom.triviaDefinition.textContent = question.definition;
  dom.triviaChoices.replaceChildren(
    ...question.choices.map((word, i) => {
      const choice = mk("div", "trivia-choice");
      choice.append(mk("span", "trivia-choice-letter", LETTERS[i]), mk("span", "trivia-choice-word", word));
      return choice;
    }),
  );
  dom.triviaCard.classList.add("show");
  // Fades out the leftover crossword board/wheel/gift-guide (style.css's body.trivia-active) so
  // this reads as its own round, not a popup sitting on top of the previous one.
  document.body.classList.add("trivia-active");
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
