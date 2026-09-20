import { audio } from "../audio";
import { state } from "../game/state";
import { FX, GIFT_COLORS, STAGE_H, STAGE_W } from "./config";
import { fxCtx } from "./dom";
import { rand } from "./utils";

interface BaseParticle {
  x: number;
  y: number;
  life: number;
  max: number;
  color: string;
  delay?: number;
  dead?: boolean;
}
interface RingParticle extends BaseParticle {
  kind: "ring";
  size: number;
}
interface StreakParticle extends BaseParticle {
  kind: "streak";
  vx: number;
  vy: number;
  g: number;
  drag: number;
  size: number;
}
interface StarParticle extends BaseParticle {
  kind: "star";
  vx: number;
  vy: number;
  g: number;
  size: number;
}
interface ConfParticle extends BaseParticle {
  kind: "conf";
  vx: number;
  vy: number;
  w: number;
  h: number;
  rot: number;
  vr: number;
  sway: number;
}
type FxParticle = RingParticle | StreakParticle | StarParticle | ConfParticle;

let fxParticles: FxParticle[] = [];
let fxLast = Date.now();
let fxDirty = false;

// Ceiling on concurrent particles: several effects can overlap (tile sparkles, fireworks,
// confetti) and each one draws with shadowBlur, which is expensive per-call on canvas. Past
// this many, further spawns are dropped rather than letting the frame cost grow unbounded.
const MAX_FX_PARTICLES = 450;

const pickColor = () => GIFT_COLORS[Math.floor(Math.random() * GIFT_COLORS.length)]!;

function pushParticle(p: FxParticle): void {
  if (fxParticles.length >= MAX_FX_PARTICLES) return;
  fxDirty = true;
  fxParticles.push(p);
}

/** Little stars when a gift tile pops. */
export function spawnSparkles(x: number, y: number, n: number): void {
  for (let i = 0; i < n; i++) {
    const a = rand(0, Math.PI * 2), sp = rand(30, 120) * FX;
    pushParticle({
      kind: "star", x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 30 * FX, g: 170 * FX,
      life: 0, max: rand(0.5, 0.9), size: rand(3, 6.5) * FX, color: pickColor(),
    });
  }
}

/** Firework: expanding ring + glowing streaks. */
export function spawnBurst(x: number, y: number, scale = 1): void {
  audio.burst(scale);
  pushParticle({ kind: "ring", x, y, life: 0, max: 0.6, size: scale * FX, color: "#fff4d6" });
  const n = Math.round(56 * scale);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rand(-0.08, 0.08), sp = rand(120, 270) * scale * FX;
    pushParticle({
      kind: "streak", x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, g: 90 * FX, drag: 0.975,
      life: 0, max: rand(1.1, 1.8), size: rand(2.4, 4) * FX, color: pickColor(),
    });
  }
}

export function spawnConfetti(n: number): void {
  audio.confetti();
  for (let i = 0; i < n; i++) {
    pushParticle({
      kind: "conf", x: rand(0, STAGE_W), y: rand(-30, -8) * FX, vx: rand(-25, 25) * FX, vy: rand(100, 200) * FX,
      life: 0, max: rand(3, 4.4), delay: rand(0, 1.1), w: rand(6, 10) * FX, h: rand(3.5, 6) * FX,
      rot: rand(0, 6.28), vr: rand(-6, 6), sway: rand(0, 6.28), color: pickColor(),
    });
  }
}

export function drawFx(now: number): void {
  const dt = Math.min(0.05, Math.max(0.001, (now - fxLast) / 1000));
  fxLast = now;
  if (!fxParticles.length) {
    if (fxDirty) {
      fxCtx.setTransform(1, 0, 0, 1, 0, 0);
      fxCtx.clearRect(0, 0, fxCtx.canvas.width, fxCtx.canvas.height);
      fxDirty = false;
    }
    return;
  }
  fxCtx.setTransform(state.pxRatio, 0, 0, state.pxRatio, 0, 0);
  fxCtx.clearRect(0, 0, STAGE_W, STAGE_H);

  let anyDead = false;
  for (const p of fxParticles) {
    if ((p.delay ?? 0) > 0) {
      p.delay = (p.delay ?? 0) - dt;
      continue;
    }
    p.life += dt;
    const t = p.life / p.max;
    if (t >= 1) {
      p.dead = true;
      anyDead = true;
      continue;
    }
    fxCtx.save();

    if (p.kind === "ring") {
      fxCtx.globalAlpha = 1 - t;
      fxCtx.strokeStyle = p.color;
      fxCtx.lineWidth = (1 + 3 * (1 - t)) * FX;
      fxCtx.beginPath();
      fxCtx.arc(p.x, p.y, (8 + (t * 60 * p.size) / FX) * FX, 0, Math.PI * 2);
      fxCtx.stroke();
    } else if (p.kind === "streak") {
      const d = Math.pow(p.drag, dt * 60);
      p.vx *= d;
      p.vy *= d;
      p.vy += p.g * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      fxCtx.globalAlpha = Math.min(1, (1 - t) * 1.8);
      fxCtx.strokeStyle = p.color;
      fxCtx.lineWidth = p.size;
      fxCtx.lineCap = "round";
      fxCtx.shadowColor = p.color;
      fxCtx.shadowBlur = 12 * FX;
      fxCtx.beginPath();
      fxCtx.moveTo(p.x - p.vx * 0.09, p.y - p.vy * 0.09);
      fxCtx.lineTo(p.x, p.y);
      fxCtx.stroke();
      fxCtx.fillStyle = "#fff";
      fxCtx.beginPath();
      fxCtx.arc(p.x, p.y, p.size * 0.55, 0, Math.PI * 2);
      fxCtx.fill();
    } else if (p.kind === "star") {
      p.vy += p.g * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      const r = p.size * (1 - t * 0.6);
      fxCtx.globalAlpha = 1 - t;
      fxCtx.fillStyle = p.color;
      fxCtx.shadowColor = p.color;
      fxCtx.shadowBlur = 8 * FX;
      fxCtx.beginPath();
      for (let i = 0; i < 8; i++) {
        // 4-point sparkle
        const ang = (i * Math.PI) / 4 - Math.PI / 2, rad = i % 2 === 0 ? r : r * 0.35;
        fxCtx.lineTo(p.x + Math.cos(ang) * rad, p.y + Math.sin(ang) * rad);
      }
      fxCtx.closePath();
      fxCtx.fill();
    } else if (p.kind === "conf") {
      p.x += (p.vx + Math.sin(p.sway + p.life * 3) * 22 * FX) * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
      if (p.y > STAGE_H + 20) {
        p.dead = true;
        anyDead = true;
        fxCtx.restore();
        continue;
      }
      fxCtx.globalAlpha = Math.min(1, (1 - t) * 3);
      fxCtx.translate(p.x, p.y);
      fxCtx.rotate(p.rot);
      fxCtx.scale(1, Math.abs(Math.cos(p.life * 6 + p.sway)) * 0.8 + 0.2); // flutter
      fxCtx.fillStyle = p.color;
      fxCtx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
    }
    fxCtx.restore();
  }
  // Skip the reallocation on the (common) frame where nothing actually died.
  if (anyDead) fxParticles = fxParticles.filter((p) => !p.dead);
}

/** Clears all in-flight particles — used when a board resets mid-celebration. */
export function clearFx(): void {
  fxParticles = [];
}
