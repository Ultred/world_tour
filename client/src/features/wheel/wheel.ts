import { audio } from "../../audio";
import { dom, mk } from "../../core/dom";
import { state } from "../../game/state";
import { mulberry32 } from "../board/layout";

function computeSlotPositions(n: number): { x: number; y: number }[] {
  const cx = 300, cy = 300, radius = 153;
  return Array.from({ length: n }, (_, i) => {
    const angle = (i / n) * Math.PI * 2 - Math.PI / 2;
    const r = radius + (i % 2 === 0 ? -18 : 18);
    return { x: cx + Math.cos(angle) * r, y: cy + Math.sin(angle) * r };
  });
}

export function renderLetterRack(letters: string[]): void {
  const wrap = dom.letterWheelWrap;
  wrap.querySelectorAll(".wheel-letter").forEach((el) => el.remove());
  state.slotPositions = computeSlotPositions(letters.length);
  state.letterElements = letters.map((l, i) => {
    const el = mk("div", "wheel-letter", l);
    el.style.left = state.slotPositions[i]!.x + "px";
    el.style.top = state.slotPositions[i]!.y + "px";
    wrap.appendChild(el);
    return el;
  });
}

/**
 * `rand` (a shared [0,1) value — see `PowerUpEvent.rand`) seeds the shuffle order instead of
 * calling `Math.random()` directly, so every connected screen (the ?obs=1 broadcast view
 * included) ends up with the letters in the identical arrangement, not just the identical set.
 */
export function shuffleLetters(rand: number = Math.random()): void {
  if (state.letterElements.length < 2) return;
  const rnd = mulberry32(Math.floor(rand * 2 ** 31));
  const slots = [...state.slotPositions];
  for (let i = slots.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [slots[i], slots[j]] = [slots[j]!, slots[i]!];
  }
  state.letterElements.forEach((el, i) => {
    el.style.left = slots[i]!.x + "px";
    el.style.top = slots[i]!.y + "px";
  });
  const disc = document.querySelector(".letter-wheel-disc")!;
  disc.classList.remove("shuffling");
  void (disc as HTMLElement).offsetWidth;
  disc.classList.add("shuffling");
  audio.shuffle();
}
