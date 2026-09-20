import triviaData from "./trivia.generated.json";
import type { TriviaQuestion } from "./types";

export type { TriviaQuestion } from "./types";

/** 200 A/B/C/D questions generated offline by `scripts/generate-trivia/` — see its report.md. */
export const QUESTIONS: TriviaQuestion[] = triviaData as TriviaQuestion[];

function shuffled<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy;
}

/**
 * Shuffle-bag over the whole generated question set (`trivia.generated.json`) — every question
 * plays once before any repeat, the same idea as `features/levels/levelBag.ts` minus the
 * difficulty tiers (trivia has none).
 */
class TriviaBag {
  private bag: TriviaQuestion[] = [];

  next(): TriviaQuestion {
    if (!this.bag.length) this.bag = shuffled(QUESTIONS);
    return this.bag.pop()!;
  }
}

export const triviaBag = new TriviaBag();
