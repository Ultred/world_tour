import type { Level } from "../../../../shared/types";
import { MODIFIER_CHANCE, SPEED_ROUND_MAX_WORD_LEN } from "../../core/config";
import { state } from "../../game/state";
import { hashSeed, mulberry32 } from "../board/layout";

export type RoundModifier = "speed" | "goldenTile" | "longWordHunt";
export const ROUND_MODIFIERS = ["speed", "goldenTile", "longWordHunt"] as const;

/** Text shown in the round-start intro banner and persistent chip (icon comes from `MODIFIER_THEME` instead — see roundHud.ts). */
export const MODIFIER_LABEL: Record<RoundModifier, string> = {
  speed:        "SPEED ROUND!",
  goldenTile:   "GOLDEN TILE!",
  longWordHunt: "LONG WORDS!",
};
/** Shorter text for the persistent in-round chip (limited space near the leaderboard). */
export const MODIFIER_CHIP_LABEL: Record<RoundModifier, string> = {
  speed:        "2× Speed Round",
  goldenTile:   "Spot the Golden Tile",
  longWordHunt: "5+ letters only",
};

/** Per-modifier visual identity — one glance tells a viewer which twist is live, instead of every
 * modifier sharing the same gold-bordered box. `glow` is an "r,g,b" triple for rgba() box-shadows. */
export interface ModifierTheme {
  icon: string;
  color: string;
  color2: string;
  glow: string;
}
export const MODIFIER_THEME: Record<RoundModifier, ModifierTheme> = {
  speed:        { icon: "⚡", color: "#ffce3d", color2: "#ff7a3d", glow: "255,150,60" },
  goldenTile:   { icon: "💰", color: "#ffe089", color2: "#f5923a", glow: "255,209,102" },
  longWordHunt: { icon: "📏", color: "#8fd7ff", color2: "#3d8bff", glow: "120,190,255" },
};

export interface ModifierState {
  modifier: RoundModifier | null;
  /** Only set when modifier === "goldenTile". */
  goldenWord: string | null;
  goldenIndex: number | null;
  /** The golden letter's actual (x,y) grid position — resolved separately by `refreshGoldenCell()`
   * once the crossword layout exists, since `pickModifierForLevel` only knows the word/index. */
  goldenCell: { x: number; y: number } | null;
}

export const NO_MODIFIER: ModifierState = { modifier: null, goldenWord: null, goldenIndex: null, goldenCell: null };

/**
 * Deterministic pick from `level.id`/`level.words` alone — the control tab and the `?obs=1`
 * broadcast view both call this on the same synced Level and independently land on the
 * identical modifier (and golden word, if any), the same way `levelSetup.ts` keeps the
 * crossword layout in sync — no new data needs to travel over the wire.
 *
 * Most boards roll no modifier at all (`MODIFIER_CHANCE`) — a normal round stays the default,
 * with the three twists spawning in every so often rather than being on every single board.
 */
export function pickModifierForLevel(level: Level): ModifierState {
  const rnd = mulberry32(hashSeed(level.id + ":modifier"));
  if (rnd() >= MODIFIER_CHANCE) return { ...NO_MODIFIER };
  const modifier = ROUND_MODIFIERS[Math.floor(rnd() * ROUND_MODIFIERS.length)]!;
  if (modifier !== "goldenTile") return { modifier, goldenWord: null, goldenIndex: null, goldenCell: null };
  // Excludes the featured word so the Golden Tile and Featured Word bonuses never overlap.
  const candidates = level.words.filter((w) => w !== level.featured);
  const pool = candidates.length ? candidates : level.words; // fallback for a hypothetical 1-word level
  const goldenWord = pool[Math.floor(rnd() * pool.length)]!;
  return { modifier, goldenWord, goldenIndex: Math.floor(rnd() * goldenWord.length), goldenCell: null };
}

/**
 * Speed Round trims the board down to short words only, so a 45s round is actually finishable
 * instead of dropping a full-size board into a fraction of the normal time. Excluded (5+-letter)
 * words move to `bonusWords` rather than vanishing outright, so a viewer who spells one from the
 * letter wheel still gets credit — it just never claims a board slot. Pure function of `level`,
 * so both the control tab and the `?obs=1` broadcast view compute the identical shrunk board with
 * nothing new to broadcast (the shrunk `Level` itself travels in the existing `BoardEvent`).
 */
export function shrinkForSpeedRound(level: Level): Level {
  const words = level.words.filter((w) => w.length < SPEED_ROUND_MAX_WORD_LEN);
  const longWords = level.words.filter((w) => w.length >= SPEED_ROUND_MAX_WORD_LEN);
  return { ...level, words, bonusWords: [...level.bonusWords, ...longWords] };
}

export const activeModifier: ModifierState = { ...NO_MODIFIER };

export function setActiveModifier(next: ModifierState): void {
  activeModifier.modifier = next.modifier;
  activeModifier.goldenWord = next.goldenWord;
  activeModifier.goldenIndex = next.goldenIndex;
  activeModifier.goldenCell = next.goldenCell;
}

/**
 * Resolves the golden word/index into an actual grid (x,y) so `board.ts` can mark the still-hidden
 * tile visibly. Must be called AFTER `setupLevel()` has built the crossword layout (`state.wordPlacements`
 * doesn't exist before that) — see `progression.ts`'s call order. Since the layout itself is
 * deterministically seeded from `level.id` (features/board/layout.ts), the control tab and the
 * `?obs=1` broadcast view independently compute the identical cell, same as everything else here.
 */
export function refreshGoldenCell(): void {
  if (activeModifier.modifier !== "goldenTile" || !activeModifier.goldenWord || activeModifier.goldenIndex == null) {
    activeModifier.goldenCell = null;
    return;
  }
  const placement = state.wordPlacements[activeModifier.goldenWord];
  const cell = placement?.cells[activeModifier.goldenIndex];
  activeModifier.goldenCell = cell ? { x: cell.x, y: cell.y } : null;
}
