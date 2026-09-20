// Stage: TikTok vertical 1080x1920. Every coordinate elsewhere is in stage pixels.
export const STAGE_W = 1080;
export const STAGE_H = 1920;
export const BOARD_W = 1080;
export const BOARD_H = 720;
/** Board canvas top offset — sits under the leaderboard. */
export const BOARD_TOP = 264;

export const TILE = 112; // tile size (shrinks automatically if a board is very big)
export const GAP = 10; // gap between tiles, so tiles read as ONE connected shape
export const TILE_RADIUS = 20;
export const REVEAL_STAGGER_MS = 90; // delay between each letter popping in
export const JUMP_DURATION_MS = 260; // each letter's pop/jump animation
export const BIG_JUMP_MS = 380; // featured-word tiles jump higher and a little slower
export const FEATURED_STAGGER_MS = 130; // featured word: slower, more dramatic reveal

export const TICKER_SPEED = 120; // leaderboard marquee speed, px per second

export const LIMIT_TIERS: { cols: number; rows: number }[] = [
  { cols: 8, rows: 5 },
  { cols: 9, rows: 6 },
  { cols: 12, rows: 9 },
];
export const LAYOUT_ATTEMPTS = 1500;

export const GIFT_WORD_STAGGER_MS = 380; // gap between words in the reveal cascade
export const GIFT_BONUS = 10; // extra points for the gifter (0 disables)
export const GIFT_BANNER_MS = 3200; // how long the reward banner stays up
export const FEAT_PLAQUE_MS = 2900;
export const GIFT_COLORS = ["#ffd166", "#f5923a", "#ff9d7a", "#8ee6c8", "#fff4d6", "#a8d0ff"];
export const FX = 2; // particle size/speed multiplier for the bigger stage
