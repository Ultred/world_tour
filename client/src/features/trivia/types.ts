/**
 * Re-exports the canonical `TriviaQuestion` shape from `shared/types.ts`, so a `TriviaEvent`
 * broadcast (main.ts/trivia.ts) and the generator script all use the exact same type.
 */
export type { TriviaQuestion } from "../../../../shared/types";
