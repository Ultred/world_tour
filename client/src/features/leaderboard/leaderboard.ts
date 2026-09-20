import { audio } from "../../audio";
import { avatarEl } from "../../core/avatar";
import { TICKER_SPEED } from "../../core/config";
import { dom, mk } from "../../core/dom";
import { state } from "../../game/state";
import type { Player } from "../../game/types";
import { streak } from "./streak";

export function renderLeaderboard(): void {
  const ranked = Object.values(state.players).sort((a, b) => b.score - a.score);
  if (state.leaderName && ranked[0] && ranked[0].name !== state.leaderName) audio.rankUp(); // someone new took #1
  state.leaderName = ranked[0] ? ranked[0].name : null;
  renderLeader(ranked[0]);
  renderTicker(ranked.slice(1));
}

/** Updates the "🔥 x3" combo badge — hidden until an actual chain has formed (streak.count >= 2),
 * since showing it for every single solve would just be noise. See features/leaderboard/streak.ts. */
export function renderStreakBadge(): void {
  const active = streak.count >= 2;
  dom.streakBadge.classList.toggle("hidden", !active);
  if (active) dom.streakBadge.textContent = `🔥 x${streak.multiplier}`;
}

function renderLeader(p: Player | undefined): void {
  dom.lbLeader.replaceChildren();
  if (!p) {
    dom.lbLeader.append(mk("div", "lb-empty", "No leader yet"));
    return;
  }
  const info = mk("div", "lb-info");
  info.append(mk("div", "lb-name", p.name), mk("div", "lb-score", `${p.score} pts`));
  dom.lbLeader.append(mk("div", "lb-crown", "👑"), avatarEl(p), info);
}

function tickerItem(p: Player, rank: number): HTMLDivElement {
  const el = mk("div", "tk-item");
  el.append(mk("span", "tk-rank", String(rank)), avatarEl(p), mk("span", "tk-name", p.name), mk("span", "tk-score", String(p.score)));
  return el;
}

// Rebuilds the ticker. If the names are wider than the strip they scroll forever
// (the set is duplicated so the loop is seamless); otherwise they just sit still.
// The scroll position is carried over so score updates don't make it jump back to the start.
function renderTicker(others: Player[]): void {
  const prevTime = state.tickerAnim ? Number(state.tickerAnim.currentTime) || 0 : 0;
  if (state.tickerAnim) {
    state.tickerAnim.cancel();
    state.tickerAnim = null;
  }
  dom.lbTrack.replaceChildren();

  if (!others.length) {
    dom.lbTrack.append(mk("div", "tk-empty", "Comment a word to join in"));
    return;
  }

  const set = mk("div", "lb-set");
  others.forEach((p, i) => set.append(tickerItem(p, i + 2)));
  dom.lbTrack.append(set);

  const setW = set.offsetWidth;
  if (setW <= dom.lbView.clientWidth) return;

  dom.lbTrack.append(set.cloneNode(true));
  const duration = (setW / TICKER_SPEED) * 1000;
  state.tickerAnim = dom.lbTrack.animate(
    [{ transform: "translateX(0)" }, { transform: `translateX(${-setW}px)` }],
    { duration, iterations: Infinity },
  );
  state.tickerAnim.currentTime = prevTime % duration;
}
