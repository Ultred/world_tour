import { dom, mk } from "../../core/dom";

interface ToastItem {
  text: string;
  isWrong?: boolean;
  isBonus?: boolean;
}

// Toasts are shown ONE AT A TIME through a queue, so they can never overlap.
const toastQueue: ToastItem[] = [];
let toastBusy = false;

export function flashNearBoard(text: string, isWrong?: boolean, isBonus?: boolean): void {
  toastQueue.push({ text, isWrong, isBonus });
  if (toastQueue.length > 4) toastQueue.splice(0, toastQueue.length - 4); // busy chat: drop the oldest
  if (!toastBusy) showNextToast();
}

function showNextToast(): void {
  const t = toastQueue.shift();
  if (!t) {
    toastBusy = false;
    return;
  }
  toastBusy = true;
  const el = mk("div", "flash-word" + (t.isWrong ? " wrong" : "") + (t.isBonus ? " bonus" : ""), t.text);
  dom.stage.appendChild(el);
  requestAnimationFrame(() => el.classList.add("show"));
  // the more toasts are waiting, the faster we move through them
  const hold = toastQueue.length >= 2 ? 500 : toastQueue.length === 1 ? 800 : 1400;
  setTimeout(() => el.classList.remove("show"), hold);
  setTimeout(() => {
    el.remove();
    showNextToast();
  }, hold + 300);
}
