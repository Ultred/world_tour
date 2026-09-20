import type { TikTokUser } from "../../../shared/types";
import { getFirstName } from "./displayName";
import type { Level } from "../features/levels/types";
import type { Cell, Placement, Player } from "./types";

export interface GameState {
  /** The level currently in play — its `bonusWords`/`words`/`letters` drive the board. */
  currentLevel: Level | null;
  gridCols: number;
  gridRows: number;
  /** grid[y][x] = a revealed tile, or null while hidden. */
  grid: (Cell | null)[][];
  /** cellExists[y][x] = true if any target word occupies this cell. */
  cellExists: boolean[][];
  wordPlacements: Record<string, Placement>;
  /** Featured (longest) word of the level. */
  targetWord: string;
  solvedCount: number;
  usedBonusWords: Set<string>;
  players: Record<string, Player>;
  boardComplete: boolean;

  stageTimers: ReturnType<typeof setTimeout>[];
  /** completeBoard() waits for this so a celebration is never cut off. */
  stageBusyUntil: number;
  /** Canvas resolution: devicePixelRatio * stage scale. */
  pxRatio: number;
  letterElements: HTMLDivElement[];
  slotPositions: { x: number; y: number }[];
  tickerAnim: Animation | null;
  leaderName: string | null;
}

export const state: GameState = {
  currentLevel: null,
  gridCols: 8,
  gridRows: 5,
  grid: [],
  cellExists: [],
  wordPlacements: {},
  targetWord: "",
  solvedCount: 0,
  usedBonusWords: new Set(),
  players: {},
  boardComplete: false,

  stageTimers: [],
  stageBusyUntil: 0,
  pxRatio: 1,
  letterElements: [],
  slotPositions: [],
  tickerAnim: null,
  leaderName: null,
};

function colorFromId(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = id.charCodeAt(i) + ((h << 5) - h);
  return `hsl(${Math.abs(h) % 360}, 60%, 45%)`;
}

/** Fetches or creates the `Player` for a TikTok user, keyed by the stable `user.id` (not the display name — two viewers can share a first name). */
export function getPlayer(user: TikTokUser): Player {
  const existing = state.players[user.id];
  if (existing) return existing;
  const player: Player = {
    id: user.id,
    name: getFirstName(user),
    fullName: user.nickname || user.uniqueId,
    score: 0,
    color: colorFromId(user.id),
    avatarUrl: user.avatarUrl,
  };
  state.players[user.id] = player;
  return player;
}

/** Schedules `fn` after `ms`, tracked so `clearStageTimers` can cancel every pending celebration step. */
export function stageLater(ms: number, fn: () => void): ReturnType<typeof setTimeout> {
  const id = setTimeout(fn, ms);
  state.stageTimers.push(id);
  return id;
}

export function clearStageTimers(): void {
  state.stageTimers.forEach(clearTimeout);
  state.stageTimers = [];
  state.stageBusyUntil = 0;
}
