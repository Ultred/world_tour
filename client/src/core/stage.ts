import { drawBoard } from "../features/board/board";
import { renderRoundHud, tickRound } from "../features/round/round";
import { state } from "../game/state";
import { BOARD_H, BOARD_W, STAGE_H, STAGE_W } from "./config";
import { dom } from "./dom";
import { drawFx } from "./fx";

/** The app's single render loop — drives the round timer, the board, and fx together every frame. */
export function animLoop(): void {
  const now = Date.now();
  tickRound(now);
  renderRoundHud(now);
  drawBoard();
  drawFx(now);
  requestAnimationFrame(animLoop);
}

/** Fits the 1080x1920 stage into the window, keeping canvases crisp at any size. */
export function fitStage(): void {
  const scale = Math.min(innerWidth / STAGE_W, innerHeight / STAGE_H);
  dom.frame.style.width = STAGE_W * scale + "px";
  dom.frame.style.height = STAGE_H * scale + "px";
  dom.stage.style.transform = `scale(${scale})`;
  state.pxRatio = (window.devicePixelRatio || 1) * scale; // keep canvases crisp at any size

  dom.canvas.width = BOARD_W * state.pxRatio;
  dom.canvas.height = BOARD_H * state.pxRatio;
  dom.canvas.style.width = BOARD_W + "px";
  dom.canvas.style.height = BOARD_H + "px";
  dom.fxCanvas.width = STAGE_W * state.pxRatio;
  dom.fxCanvas.height = STAGE_H * state.pxRatio;
  dom.fxCanvas.style.width = STAGE_W + "px";
  dom.fxCanvas.style.height = STAGE_H + "px";
}
