import { BOARD_H, BOARD_TOP, BOARD_W, BIG_JUMP_MS, GAP, JUMP_DURATION_MS, TILE, TILE_RADIUS } from "../../core/config";
import { ctx } from "../../core/dom";
import { spawnGoldSparkles, spawnSparkles } from "../../core/fx";
import { state } from "../../game/state";
import type { BoardMetrics } from "../../game/types";
import { activeModifier } from "../round/modifiers";

export function roundRectPath(x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function getBoardMetrics(): BoardMetrics {
  // Shrink tiles only if the board would not fit; otherwise use the full TILE size.
  const margin = 44;
  const fit = Math.min((BOARD_W - margin * 2 + GAP) / state.gridCols, (BOARD_H - margin * 2 + GAP) / state.gridRows) - GAP;
  const tile = Math.min(TILE, Math.floor(fit));
  const step = tile + GAP;
  return {
    tile,
    step,
    offsetX: Math.round((BOARD_W - (state.gridCols * step - GAP)) / 2), // centred with equal padding
    offsetY: Math.round((BOARD_H - (state.gridRows * step - GAP)) / 2),
  };
}

export function drawBoard(): void {
  const now = Date.now();
  ctx.setTransform(state.pxRatio, 0, 0, state.pxRatio, 0, 0);
  ctx.clearRect(0, 0, BOARD_W, BOARD_H);
  const { tile, step, offsetX, offsetY } = getBoardMetrics();

  for (let y = 0; y < state.gridRows; y++) {
    for (let x = 0; x < state.gridCols; x++) {
      if (!state.cellExists[y]?.[x]) continue;
      const px = offsetX + x * step, py = offsetY + y * step;
      const cell = state.grid[y]?.[x] ?? null;
      const visible = !!cell && now >= cell.revealAnimStart;
      // Golden Tile modifier: the target cell is marked while still hidden (letter stays
      // secret) so viewers know exactly where to aim — see features/round/modifiers.ts.
      const isGoldenHidden = !visible && activeModifier.goldenCell?.x === x && activeModifier.goldenCell?.y === y;

      let jumpOffset = 0, scale = 1;
      if (visible && cell) {
        const elapsed = now - cell.revealAnimStart;
        const dur = cell.big ? BIG_JUMP_MS : JUMP_DURATION_MS;
        if (elapsed < dur) {
          const t = elapsed / dur;
          const bounce = Math.sin(t * Math.PI) * (1 - t);
          const amp = cell.big ? 1.9 : 1; // featured tiles leap higher
          jumpOffset = -tile * 0.2 * amp * bounce;
          scale = 1 + 0.14 * amp * bounce;
        }
      }

      const cx = px + tile / 2, cy = py + tile / 2;
      ctx.save();
      ctx.translate(cx, cy + jumpOffset);
      ctx.scale(scale, scale);
      ctx.translate(-cx, -cy);

      // ONE base tile style for every state; only the fill changes between hidden and revealed.
      ctx.shadowColor = "rgba(0,0,0,0.22)";
      ctx.shadowBlur = tile * 0.13;
      ctx.shadowOffsetY = tile * 0.04;
      roundRectPath(px, py, tile, tile, TILE_RADIUS);
      ctx.fillStyle = visible
        ? cell!.missed
          ? "rgba(255,255,255,0.35)" // revealed by the round timer running out, not solved — dimmed
          : cell!.owner
            ? (state.players[cell!.owner]?.color ?? "#f5923a")
            : "#f5923a"
        : isGoldenHidden
          ? "#ffd166"
          : "rgba(255,255,255,0.75)";
      ctx.fill();

      // A gentle pulsing glow on top of the gold fill, so it reads as "special" from a glance
      // rather than just a differently-coloured tile.
      if (isGoldenHidden) {
        const pulse = 0.5 + 0.5 * Math.sin(now / 260);
        ctx.shadowColor = `rgba(255,209,102,${0.5 + 0.4 * pulse})`;
        ctx.shadowBlur = tile * (0.22 + 0.18 * pulse);
        ctx.shadowOffsetY = 0;
        roundRectPath(px, py, tile, tile, TILE_RADIUS);
        ctx.fillStyle = "#ffd166";
        ctx.fill();
      }

      // Golden Tile modifier's own letter: a coin-flash + rotating sunburst, distinct from the
      // plain gift shimmer below — this is the modifier's payoff moment, so it should read as
      // its own thing rather than just another reveal animation.
      if (visible && cell!.golden) {
        const e = now - cell!.revealAnimStart;
        if (!cell!.burst) {
          cell!.burst = true;
          spawnGoldSparkles(cx, BOARD_TOP + cy, 18);
        }
        const dur = 1100;
        if (e < dur) {
          const a = 1 - e / dur;
          ctx.save();
          ctx.translate(cx, cy);
          ctx.rotate(now / 220);
          ctx.globalAlpha = a * 0.85;
          ctx.strokeStyle = "#ffe9a8";
          ctx.lineCap = "round";
          ctx.lineWidth = tile * 0.05;
          const rayLen = tile * (0.55 + 0.4 * (1 - a));
          for (let i = 0; i < 8; i++) {
            const ang = (i / 8) * Math.PI * 2;
            ctx.beginPath();
            ctx.moveTo(Math.cos(ang) * tile * 0.42, Math.sin(ang) * tile * 0.42);
            ctx.lineTo(Math.cos(ang) * rayLen, Math.sin(ang) * rayLen);
            ctx.stroke();
          }
          ctx.restore();
          ctx.shadowColor = `rgba(255,183,3,${0.95 * a})`;
          ctx.shadowBlur = tile * (0.3 + 0.55 * a);
          ctx.shadowOffsetY = 0;
          roundRectPath(px, py, tile, tile, TILE_RADIUS);
          ctx.fillStyle = `rgba(255,214,102,${0.85 * a})`;
          ctx.fill();
        }
      } else if (visible && cell!.fx) {
        // Gift tiles: a golden flash that fades into the owner's colour + a sparkle burst
        const e = now - cell!.revealAnimStart;
        if (!cell!.burst) {
          cell!.burst = true;
          spawnSparkles(cx, BOARD_TOP + cy, cell!.fx === "soft" ? 3 : cell!.big ? 12 : 8);
        }
        if (cell!.fx !== "soft" && e < 700) {
          const a = 1 - e / 700;
          ctx.shadowColor = `rgba(255,209,102,${0.9 * a})`;
          ctx.shadowBlur = tile * (0.17 + 0.4 * a);
          ctx.shadowOffsetY = 0;
          roundRectPath(px, py, tile, tile, TILE_RADIUS);
          ctx.fillStyle = `rgba(255,224,137,${0.8 * a})`;
          ctx.fill();
        }
      }
      ctx.restore();

      if (visible) {
        ctx.save();
        ctx.translate(cx, cy + jumpOffset);
        ctx.scale(scale, scale);
        ctx.fillStyle = "#fff";
        ctx.font = `bold ${Math.round(tile * 0.5)}px "Segoe UI", Arial, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(cell!.letter, 0, 2);
        ctx.restore();
      }
    }
  }
}
