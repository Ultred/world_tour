import { renderLetterRack } from "../wheel/wheel";
import { buildBestLayout, hashSeed, mulberry32 } from "./layout";
import { state } from "../../game/state";
import type { BoardInput } from "../../game/types";

/**
 * Builds a crossword board from a level's words and applies it to the live game state.
 * Seeded from `level.id` (not `Math.random`) so this is a pure function of the level — a
 * moderator's broadcast view (`?obs=1`, main.ts) that receives the same level via a
 * `BoardEvent` broadcast independently computes the exact same layout, with no need to
 * broadcast the layout itself.
 */
export function setupLevel(level: BoardInput): void {
  const layout = buildBestLayout(level.words, mulberry32(hashSeed(level.id)));
  state.gridCols = layout.cols; // board is cropped to its bounding box: no empty rows/columns
  state.gridRows = layout.rows;
  state.grid = Array.from({ length: state.gridRows }, () => new Array(state.gridCols).fill(null));
  state.cellExists = Array.from({ length: state.gridRows }, () => new Array(state.gridCols).fill(false));
  state.wordPlacements = {};
  state.solvedCount = 0;
  state.usedBonusWords = new Set();

  layout.words!.forEach((p) => {
    const cells: { x: number; y: number }[] = [];
    for (let i = 0; i < p.word.length; i++) {
      const x = p.dir === "H" ? p.startX + i : p.startX;
      const y = p.dir === "H" ? p.startY : p.startY + i;
      cells.push({ x, y });
      state.cellExists[y]![x] = true;
    }
    state.wordPlacements[p.word] = { startX: p.startX, startY: p.startY, dir: p.dir, cells, solved: false, solvedBy: null };
  });
  if (layout.missing) console.warn("Some words could not be placed:", layout.missing);

  state.targetWord = layout.words![0]!.word; // featured word = the longest one = the spine
  renderLetterRack(level.letters);
}
