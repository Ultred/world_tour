import { audio } from "../../audio";
import { avatarEl, paintAvatar } from "../../core/avatar";
import { BOARD_TOP, BOARD_W, FEAT_PLAQUE_MS } from "../../core/config";
import { dom, mk } from "../../core/dom";
import { clearFx, spawnBurst, spawnConfetti } from "../../core/fx";
import { clearStageTimers, state, stageLater } from "../../game/state";
import type { Player, SolveResult } from "../../game/types";
import { getBoardMetrics } from "./board";

/** Centre of a word, in stage pixels. */
function wordCenter(word: string): { x: number; y: number; m: ReturnType<typeof getBoardMetrics> } {
  const m = getBoardMetrics();
  const cells = state.wordPlacements[word]!.cells;
  const ax = cells.reduce((t, c) => t + c.x, 0) / cells.length;
  const ay = cells.reduce((t, c) => t + c.y, 0) / cells.length;
  return { x: m.offsetX + ax * m.step + m.tile / 2, y: BOARD_TOP + m.offsetY + ay * m.step + m.tile / 2, m };
}

export function celebrateSolve(player: Player, word: string, r: SolveResult, long: boolean): void {
  if (r.isFeatured) return featuredCelebration(player, word, r);
  wordChip(player, word, r.points, long);
  state.stageBusyUntil = Math.max(state.stageBusyUntil, Date.now() + 1900);
  if (long) {
    // 5+ letters: a small firework over the word
    const c = wordCenter(word);
    stageLater(220, () => spawnBurst(c.x, c.y, 0.5));
  }
}

/** A pill that pops above the word with the solver's avatar, name and points. */
function wordChip(player: Player, word: string, points: number, big: boolean): void {
  const m = getBoardMetrics();
  const cells = state.wordPlacements[word]!.cells;
  const c = cells[Math.floor(cells.length / 2)]!;
  const chip = mk("div", "word-chip" + (big ? " big" : ""));
  chip.append(avatarEl(player), mk("span", "chip-name", player.name), mk("span", "chip-pts", `+${points}`));
  chip.style.left = Math.max(140, Math.min(BOARD_W - 140, m.offsetX + c.x * m.step + m.tile / 2)) + "px";
  chip.style.top = m.offsetY + c.y * m.step - 4 + "px";
  dom.boardArea.appendChild(chip);
  setTimeout(() => chip.remove(), 1900);
}

/** The featured word: a slow golden tile wave, then a trophy plaque with coin, fireworks and confetti. */
function featuredCelebration(player: Player, word: string, r: SolveResult): void {
  const wait = Math.max(0, r.endsAt - Date.now() - 150);
  state.stageBusyUntil = Math.max(state.stageBusyUntil, Date.now() + wait + FEAT_PLAQUE_MS + 300);
  const plaque = dom.featStage;

  stageLater(wait, () => {
    audio.featured();
    const letters = dom.featLetters;
    letters.textContent = "";
    [...word].forEach((ch, i) => {
      const l = mk("div", "feat-letter", ch);
      l.style.animationDelay = `${0.35 + i * 0.07}s`;
      letters.appendChild(l);
    });
    paintAvatar(dom.featAv, player);
    dom.featName.textContent = player.name;
    dom.featPts.textContent = `+${r.points}`;
    plaque.classList.add("show");

    const c = wordCenter(word);
    const cells = state.wordPlacements[word]!.cells;
    const at = (cell: { x: number; y: number }) => ({
      x: c.m.offsetX + cell.x * c.m.step + c.m.tile / 2,
      y: BOARD_TOP + c.m.offsetY + cell.y * c.m.step + c.m.tile / 2,
    });
    const first = at(cells[0]!), last = at(cells[cells.length - 1]!);
    spawnBurst(c.x, c.y, 0.85);
    stageLater(180, () => spawnBurst(first.x, first.y, 0.6));
    stageLater(340, () => spawnBurst(last.x, last.y, 0.6));
    spawnConfetti(70);
    dom.stage.classList.add("gift-glow");
    stageLater(1600, () => dom.stage.classList.remove("gift-glow"));
  });
  stageLater(wait + FEAT_PLAQUE_MS, () => plaque.classList.remove("show"));
}

/** Cancels every pending celebration timer/particle and resets celebration UI — used when a new board starts. */
export function cancelStage(): void {
  clearStageTimers();
  clearFx();
  dom.stage.classList.remove("gift-glow");
  dom.actionFirework.classList.remove("gifting");
  dom.giftBanner.classList.remove("show");
  dom.featStage.classList.remove("show");
  dom.boardArea.querySelectorAll(".word-chip").forEach((e) => e.remove());
}
