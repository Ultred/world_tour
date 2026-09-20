/**
 * Re-exports the canonical `Level`/`Difficulty` shape from `shared/types.ts`, so a `BoardEvent`
 * broadcast (main.ts/progression.ts) and the generator script all use the exact same type.
 */
export type { Difficulty, Level } from "../../../../shared/types";
