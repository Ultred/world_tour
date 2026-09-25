import type { GuessEvent, PowerUp, PowerUpEvent, StatusEvent, TikTokUser } from "../../../shared/types";
import { audio } from "../audio";
import { dom } from "../core/dom";
import { emitToServer } from "../core/net";
import { handleGuess } from "../features/board/guess";
import { clearScores } from "../features/leaderboard/persistence";
import { renderLeaderboard } from "../features/leaderboard/leaderboard";
import { resetStreak } from "../features/leaderboard/streak";
import { newBoard } from "../features/levels/progression";
import { handlePowerUp } from "../features/powerups/powerups";
import { forceTimeUp, setDurationOverrideSec, setPaused } from "../features/round/round";
import { handleTriviaAnswer, isTriviaActive } from "../features/trivia/trivia";
import { log } from "./log";

// The dev panel simulates a TikTok user from the plain username the tester typed — matches
// production's `TikTokUser` shape so it runs through the exact same `getFirstName`/`getPlayer` path.
const currentUser = (): TikTokUser => {
  const name = dom.usernameInput.value.trim() || "viewer";
  return { id: name, uniqueId: name, nickname: name };
};

const STATUS_LABEL: Record<StatusEvent["state"], string> = {
  connecting: "Connecting to TikTok LIVE…",
  connected: "Connected — live viewers are playing",
  reconnecting: "Reconnecting to TikTok LIVE…",
  offline: "Offline",
};

/** Reflects the server's `StatusEvent` in the dev panel's connection badge (main.ts's WebSocket handler). */
export function setConnectionStatus(state: StatusEvent["state"]): void {
  dom.tiktokStatus.textContent = STATUS_LABEL[state];
  dom.tiktokStatus.className = `tiktok-status ${state}`;
}

function updateSoundBtn(): void {
  dom.soundBtn.textContent = !audio.unlocked() ? "🔇 Enable sound" : audio.state.enabled ? "🔊 Sound on" : "🔇 Sound off";
}

/** Simulates a viewer guess. Routed through the server (so the ?obs=1 broadcast view sees it
 * too, same as a real chat guess would) unless the server's unreachable, in which case it
 * applies locally — single-tab-only, but the panel still works standalone with just `npm run dev`. */
async function simulateGuess(user: TikTokUser, text: string): Promise<void> {
  const event: GuessEvent = { type: "guess", user, text };
  // Same trivia-or-crossword routing as main.ts's WebSocket handler — needed here too since this
  // fallback fires standalone (no dev:server running), bypassing that handler entirely.
  if (!(await emitToServer(event))) (isTriviaActive() ? handleTriviaAnswer : handleGuess)(user, text);
}

/** Simulates a power-up button. Same server-first, local-fallback pattern as `simulateGuess`.
 * `rand` is rolled once here and travels with the event so every connected screen (the ?obs=1
 * broadcast view included) reveals the same tile/word instead of each re-rolling its own pick. */
async function simulatePowerUp(powerUp: PowerUp, user?: TikTokUser): Promise<void> {
  const event: PowerUpEvent = { type: "powerUp", powerUp, rand: Math.random(), ...(user ? { user } : {}) };
  if (!(await emitToServer(event))) handlePowerUp(event);
}

/** Ends the round right now, on every connected screen — not just this tab. Same
 * server-first, local-fallback pattern as `simulateGuess`/`simulatePowerUp`. */
async function simulateForceTimeUp(): Promise<void> {
  if (!(await emitToServer({ type: "forceTimeUp" }))) forceTimeUp();
}

/** Wipes lifetime scores on every connected screen — not just this tab. Same
 * server-first, local-fallback pattern as `simulateGuess`/`simulatePowerUp`. */
async function simulateResetLeaderboard(): Promise<void> {
  if (!(await emitToServer({ type: "resetLeaderboard" }))) {
    clearScores();
    resetStreak();
    renderLeaderboard();
  }
}

/** Wires the dev/test panel (simulated chat, power-up buttons, audio controls) — not part of the video frame. */
export function wireTestPanel(): void {
  dom.guessInput.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    const input = e.target as HTMLInputElement;
    const word = input.value.trim();
    if (word) void simulateGuess(currentUser(), word);
    input.value = "";
  });

  // Power-up buttons stand in for future TikTok gifts.
  dom.simShuffleBtn.addEventListener("click", () => void simulatePowerUp("shuffle", currentUser()));
  dom.simHintBtn.addEventListener("click", () => void simulatePowerUp("revealLetter", currentUser()));
  dom.simTargetBtn.addEventListener("click", () => void simulatePowerUp("revealWord", currentUser()));
  dom.simFireworkBtn.addEventListener("click", () => void simulatePowerUp("revealAll", currentUser()));
  dom.newBoardBtn.addEventListener("click", newBoard);
  dom.resetLeaderboardBtn.addEventListener("click", () => void simulateResetLeaderboard());
  dom.panelToggle.addEventListener("click", () => dom.devPanel.classList.toggle("hidden"));

  // Connects/disconnects the server's TikTok LIVE watch (server/index.ts's POST /api/connect|disconnect).
  // Actual status (connecting/connected/offline) arrives back over the WebSocket as a StatusEvent.
  dom.tiktokConnectBtn.addEventListener("click", async () => {
    const username = dom.tiktokHandleInput.value.trim();
    if (!username) return;
    try {
      const res = await fetch("/api/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? res.statusText);
      log(`📡 Connecting to TikTok LIVE @${username}…`, "ev-action");
    } catch (err) {
      log(`⚠ Couldn't reach the server to connect: ${err instanceof Error ? err.message : String(err)}`, "ev-wrong");
    }
  });
  dom.tiktokDisconnectBtn.addEventListener("click", async () => {
    try {
      await fetch("/api/disconnect", { method: "POST" });
      log("📡 Disconnected from TikTok LIVE", "ev-action");
    } catch (err) {
      log(`⚠ Couldn't reach the server to disconnect: ${err instanceof Error ? err.message : String(err)}`, "ev-wrong");
    }
  });

  // Round timer dev controls — pause/force-time-up/length override only ever exist here; the live game never pauses or has its length overridden.
  dom.roundPause.addEventListener("change", (e) => setPaused((e.target as HTMLInputElement).checked));
  dom.forceTimeUpBtn.addEventListener("click", () => void simulateForceTimeUp());
  dom.roundDurationApplyBtn.addEventListener("click", () => {
    const raw = dom.roundDurationOverride.value.trim();
    const sec = raw ? Number(raw) : null;
    setDurationOverrideSec(sec != null && Number.isFinite(sec) ? sec : null);
    log(
      sec != null && Number.isFinite(sec)
        ? `⏱ Round length override set to ${sec}s (applies next round)`
        : "⏱ Round length override cleared — back to the default",
      "ev-action",
    );
  });

  // Audio controls. Sound is only ever unlocked here, deliberately — not on just any click/key
  // press anywhere on the page. The control tab is a silent moderator console by default; the
  // one screen that's actually meant to be heard is the ?obs=1 broadcast view, which unlocks
  // its own audio automatically on load (main.ts) since it has no panel to click at all. Having
  // both tabs able to silently self-unlock was the source of doubled-up sound.
  dom.soundBtn.addEventListener("click", () => {
    if (!audio.unlocked()) audio.unlock();
    else audio.setEnabled(!audio.state.enabled);
    updateSoundBtn();
  });
  dom.musicOn.addEventListener("change", (e) => audio.setMusic((e.target as HTMLInputElement).checked));
  dom.sfxOn.addEventListener("change", (e) => audio.setSfx((e.target as HTMLInputElement).checked));
  dom.musicVol.addEventListener("input", (e) => audio.setMusicVol(+(e.target as HTMLInputElement).value));
  dom.sfxVol.addEventListener("input", (e) => audio.setSfxVol(+(e.target as HTMLInputElement).value));
  updateSoundBtn();
  if (innerWidth < 900) dom.devPanel.classList.add("hidden"); // keep small screens clear for the stage
}
