import type { PowerUpEvent, TikTokUser } from "../../../../shared/types";
import { audio } from "../../audio";
import { paintAvatar } from "../../core/avatar";
import { GIFT_BANNER_MS, GIFT_BONUS, GIFT_WORD_STAGGER_MS, STAGE_H, STAGE_W } from "../../core/config";
import { dom } from "../../core/dom";
import { spawnBurst, spawnConfetti } from "../../core/fx";
import { log } from "../../dev/log";
import { getPlayer, state, stageLater } from "../../game/state";
import type { Player } from "../../game/types";
import { completeBoard, handleGuess, solvePlacement } from "../board/guess";
import { renderLeaderboard } from "../leaderboard/leaderboard";
import { awardPoints, runOrBuffer } from "../round/round";
import { shuffleLetters } from "../wheel/wheel";

// Every real gift has a gifter, but PowerUpEvent.user stays optional for the dev panel's plain
// "Shuffle" button (no specific viewer to credit) — this fills in so `getFirstName` always has
// something to short-name, matching the plan's 'Chat' fallback (8.5/8.6).
const CHAT_USER: TikTokUser = { id: "chat", uniqueId: "chat", nickname: "Chat" };

/** Dispatches a server-resolved power-up (section 8.5) to the matching reveal/shuffle function — no tier lookup here, that already happened server-side. */
export function handlePowerUp(event: PowerUpEvent): void {
  const user = event.user ?? CHAT_USER;
  // Shared across every connected screen (see PowerUpEvent.rand) so the ?obs=1 broadcast view
  // reveals the same tile/word the control tab does — falls back to a local roll only when
  // applied standalone (testPanel.ts's no-server fallback), where there's nothing to stay in sync with.
  const rand = event.rand ?? Math.random();
  switch (event.powerUp) {
    case "shuffle":
      runOrBuffer(() => {
        shuffleLetters(rand);
        const src = event.user ? "🎁" : "💬";
        log(`${src} 🔀 ${getPlayer(user).name} shuffled the letters`, "ev-action");
      });
      break;
    case "revealLetter":
      runOrBuffer(() => {
        const { revealed, completed } = revealRandomLetter(user, rand);
        if (revealed) audio.hint();
        else if (!completed.length) audio.dupe();
        const src = event.user ? "🎁" : "💬";
        if (completed.length) log(`${src} 💡 ${getPlayer(user).name} revealed the last letter of ${completed.join(", ")}`, "ev-action");
        else log(`${src} 💡 Reveal a Letter — ${revealed ? "hint used" : "nothing left to reveal"}`, "ev-action");
      });
      break;
    case "revealWord":
      runOrBuffer(() => revealRandomWord(user, rand));
      break;
    case "revealAll":
      runOrBuffer(() => revealAllWords(user));
      break;
  }
}

/**
 * Reveals one random hidden letter. If that letter was the last missing tile of
 * a word (or a word is already fully showing but unsolved), the word is
 * completed and the points go to `username` — the viewer who triggered the reveal.
 * `rand` (a shared [0,1) value — see `PowerUpEvent.rand`) picks which candidate, instead of
 * calling `Math.random()` here, so every connected screen reveals the identical tile.
 */
export function revealRandomLetter(user: TikTokUser, rand: number): { revealed: boolean; completed: string[] } {
  const candidates: { x: number; y: number; letter: string }[] = [];
  Object.entries(state.wordPlacements).forEach(([word, placement]) => {
    if (placement.solved) return;
    placement.cells.forEach((c, idx) => {
      if (!state.grid[c.y]?.[c.x]) candidates.push({ x: c.x, y: c.y, letter: word[idx]! });
    });
  });
  let revealed = false;
  if (candidates.length) {
    const pick = candidates[Math.floor(rand * candidates.length)]!;
    state.grid[pick.y]![pick.x] = { letter: pick.letter, owner: null, revealAnimStart: Date.now() };
    revealed = true;
  }
  // Any unsolved word whose tiles are now all visible counts as found, credited to the triggering viewer
  const completed = Object.keys(state.wordPlacements).filter((w) => {
    const pl = state.wordPlacements[w]!;
    return !pl.solved && pl.cells.every((c) => state.grid[c.y]?.[c.x]);
  });
  completed.forEach((w) => handleGuess(user, w, "gift"));
  return { revealed, completed };
}

export function revealRandomWord(user: TikTokUser, rand: number): void {
  const unsolved = Object.keys(state.wordPlacements).filter((w) => !state.wordPlacements[w]!.solved);
  if (!unsolved.length) return;
  handleGuess(user, unsolved[Math.floor(rand * unsolved.length)]!, "gift");
}

// ============ Gift: Reveal All Words ============
export function revealAllWords(user: TikTokUser): void {
  const unsolved = Object.keys(state.wordPlacements).filter((w) => !state.wordPlacements[w]!.solved);
  if (!unsolved.length) return;
  unsolved.sort((a, b) => b.length - a.length); // spine first, then the branches

  // All state updates happen instantly; only the visuals are staged over time.
  // 'soft' fx (not `true`): every word's tiles reveal near-simultaneously here, unlike a
  // normal one-word solve, so a full sparkle burst + glow overlay per tile (drawBoard's
  // `fx !== 'soft'` branch) on every tile at once was the actual source of the reported
  // lag — dozens of concurrent shadowBlur draws. 'soft' keeps the golden-tile look without it.
  let total = 0, lastEnd = Date.now();
  unsolved.forEach((word, i) => {
    const r = solvePlacement(user, word, { delay: i * GIFT_WORD_STAGGER_MS, fx: "soft" });
    total += r.points;
    lastEnd = Math.max(lastEnd, r.endsAt);
  });
  total += GIFT_BONUS;
  awardPoints(user, GIFT_BONUS);
  renderLeaderboard();
  audio.gift();
  const player = getPlayer(user);
  log(`🎁 ${player.name} revealed all ${unsolved.length} words — +${total} pts`, "ev-gift");

  dom.stage.classList.add("gift-glow");
  dom.actionFirework.classList.add("gifting");
  stageLater(Math.max(0, lastEnd - Date.now()) + 150, () => giftFinale(player, unsolved.length, total));
}

function giftFinale(player: Player, wordCount: number, total: number): void {
  dom.stage.classList.remove("gift-glow");
  dom.actionFirework.classList.remove("gifting");
  // five firework bursts across the upper stage, then confetti rain
  ([[0.2, 0.18], [0.8, 0.22], [0.5, 0.14], [0.34, 0.34], [0.68, 0.36]] as const).forEach((b, i) => {
    stageLater(i * 230, () => spawnBurst(b[0] * STAGE_W, b[1] * STAGE_H));
  });
  audio.finale();
  // Lighter than the original 150: still reads as a confetti rain, less compounding load
  // on top of the fireworks and the tile-reveal cascade's own sparkles.
  stageLater(120, () => spawnConfetti(90));
  showGiftBanner(player, wordCount, total);
  completeBoard(GIFT_BANNER_MS + 500); // hold the finished board until the banner is done
}

function showGiftBanner(player: Player, wordCount: number, total: number): void {
  const banner = dom.giftBanner;
  paintAvatar(dom.giftAvatar, player);
  dom.giftName.textContent = player.name;
  dom.giftWords.textContent = String(wordCount);
  dom.giftWordsLbl.textContent = wordCount === 1 ? "WORD" : "WORDS";
  dom.giftBonusVal.textContent = `+${GIFT_BONUS}`;
  dom.giftBonusChip.style.display = GIFT_BONUS ? "" : "none";
  const pts = dom.giftPoints;
  pts.textContent = "0";
  banner.classList.add("show");
  audio.giftBanner(1);
  state.stageBusyUntil = Math.max(state.stageBusyUntil, Date.now() + GIFT_BANNER_MS);

  const t0 = Date.now(), dur = 1000; // points count up
  (function tick() {
    if (!banner.classList.contains("show")) return;
    const t = Math.min(1, (Date.now() - t0) / dur);
    pts.textContent = String(Math.round(total * (1 - Math.pow(1 - t, 3))));
    if (t < 1) requestAnimationFrame(tick);
  })();
  stageLater(GIFT_BANNER_MS, () => banner.classList.remove("show"));
}
