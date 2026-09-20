export type Direction = "H" | "V";

/** One board tile once it has been revealed. `null` in the grid means still hidden. */
export interface Cell {
  letter: string;
  /** Player id who gets credit for this tile's colour; `null` for a bare hint reveal. */
  owner: string | null;
  /** `Date.now()`-based timestamp; the tile pops in once `now >= revealAnimStart`. */
  revealAnimStart: number;
  /** Golden gift-reveal effect: `true` = full sparkle burst, `'soft'` = a few sparkles. */
  fx?: boolean | "soft";
  /** Featured-word tile: jumps higher/slower and uses BIG_JUMP_MS. */
  big?: boolean;
  /** Internal: the sparkle burst for this tile has already been spawned once. */
  burst?: boolean;
  /** Revealed by the round timer running out, not solved by anyone — dimmed, no owner, no points. */
  missed?: boolean;
}

export interface Placement {
  startX: number;
  startY: number;
  dir: Direction;
  cells: { x: number; y: number }[];
  solved: boolean;
  /** Player id (`TikTokUser.id`), not a display name. */
  solvedBy: string | null;
}

export interface Player {
  /** Stable key — `TikTokUser.id`. */
  id: string;
  /** Short display name from `getFirstName()`. */
  name: string;
  fullName: string;
  score: number;
  color: string;
  avatarUrl?: string;
}

/** What `setupLevel` needs to build a board — satisfied by any `Level` (see `game/levels/types.ts`). */
export interface BoardInput {
  /** Seeds the crossword layout (see levelSetup.ts) so the same level always lays out the
   * same way — needed so a moderator's broadcast view computes the identical board independently. */
  id: string;
  letters: string[];
  words: string[];
}

export interface LayoutCellInfo {
  ch: string;
  dirs: Set<Direction>;
}

export interface PlacedWord {
  word: string;
  x: number;
  y: number;
  dir: Direction;
}

export interface LayoutWord {
  word: string;
  dir: Direction;
  startX: number;
  startY: number;
}

export interface Layout {
  placed: PlacedWord[];
  cells: Map<string, LayoutCellInfo>;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  cols: number;
  rows: number;
  /** Count of words that could not be placed; 0 (falsy) means a complete layout. */
  missing: number;
  score?: number;
  /** Normalised (top-left-origin) placements, set by `buildBestLayout`. */
  words?: LayoutWord[];
}

export interface SolveOptions {
  /** ms to wait before the first tile pops (used by the gift cascade). */
  delay?: number;
  fx?: boolean | "soft";
  big?: boolean;
  /** ms between tiles; defaults to REVEAL_STAGGER_MS. */
  stagger?: number;
  /** Streak/combo multiplier (see features/leaderboard/streak.ts) — defaults to 1 (unaffected) when omitted. */
  multiplier?: number;
}

export interface SolveResult {
  points: number;
  isFeatured: boolean;
  /** `Date.now()`-based timestamp when this word's reveal animation finishes. */
  endsAt: number;
}

export interface BoardMetrics {
  tile: number;
  step: number;
  offsetX: number;
  offsetY: number;
}
