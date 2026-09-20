import "./style.css";
import type { GameEvent } from "../../shared/types";
import { audio } from "./audio";
import { emitToServer } from "./core/net";
import { animLoop, fitStage } from "./core/stage";
import { setConnectionStatus, wireTestPanel } from "./dev/testPanel";
import { handleGuess } from "./features/board/guess";
import { setupLevel } from "./features/board/levelSetup";
import { clearScores, loadScores } from "./features/leaderboard/persistence";
import { renderLeaderboard } from "./features/leaderboard/leaderboard";
import { resetStreak } from "./features/leaderboard/streak";
import { levelBag } from "./features/levels";
import { applyBoardBroadcast, newBoard } from "./features/levels/progression";
import { handlePowerUp } from "./features/powerups/powerups";
import { forceTimeUp, startRound, startRoundWatchdog, tickRound } from "./features/round/round";
import { state } from "./game/state";

// ============ Init ============
// ?obs=1 is the moderator's broadcast view — hides the dev/test panel and, unlike the plain
// control-tab view, never picks its own level or round timing. It's a pure follower, mirroring
// whatever the control tab (the plain, non-"?obs=1" view) broadcasts, so both screens always
// show the exact same board and countdown instead of two independent games. Point OBS's Window
// Capture/Browser Source at this URL. See game/progression.ts.
const obsMode = new URLSearchParams(location.search).has("obs");
if (obsMode) {
  document.body.classList.add("obs-mode");
  // The broadcast view has no panel to click a "sound" button on, and needs to be heard —
  // unlike a plain browser tab, an actual OBS Browser Source doesn't enforce the "needs a user
  // gesture first" autoplay policy, so this succeeds immediately there. The control tab stays
  // silent by default (testPanel.ts) so only one screen is ever producing sound.
  audio.unlock();
}

addEventListener("resize", fitStage);
fitStage();
loadScores(); // restore lifetime scores saved from a previous session (localStorage)
renderLeaderboard();
if (!obsMode) {
  const firstLevel = levelBag.next();
  state.currentLevel = firstLevel;
  setupLevel(firstLevel);
  const deadline = startRound(newBoard); // begins the first round's "GET READY" intro; newBoard() runs after each round's summary
  emitToServer({ type: "board", level: firstLevel, deadline });
}
startRoundWatchdog(); // keeps the round advancing even while this tab is hidden/backgrounded
// Belt-and-suspenders: some browsers freeze a backgrounded tab's timers more aggressively than
// the spec strictly requires (e.g. Chrome's Memory Saver), which can starve the watchdog's own
// setInterval. visibilitychange always fires the instant the tab becomes visible again, so this
// guarantees an immediate, correct catch-up tick even in that worst case.
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) tickRound();
});
wireTestPanel();
animLoop();

// ============ TikTok LIVE (Phase 2) ============
// The server (server/index.ts) already resolved gifts to a power-up (section 8.7) and
// validated guesses come from a real chat message — this socket just runs whatever GameEvent
// arrives. Moderator-simulated guesses/power-ups and the control tab's board choices arrive
// here too (server/index.ts's POST /api/emit), so every connected screen applies the identical
// event stream in the identical order. The control tab still works standalone (single-tab, no
// cross-screen sync) when no server is running — see dev/testPanel.ts's fallback.
function connectTikTok(): void {
  const ws = new WebSocket(`ws://${location.host}/ws`);
  ws.onmessage = (msg: MessageEvent<string>) => {
    const e = JSON.parse(msg.data) as GameEvent; // later: validate with zod
    switch (e.type) {
      case "guess":
        handleGuess(e.user, e.text);
        break;
      case "powerUp":
        handlePowerUp(e);
        break;
      case "status":
        setConnectionStatus(e.state);
        break;
      case "board":
        // The control tab already applied its own board choice locally (progression.ts's
        // newBoard) before publishing it — only the broadcast view needs to react to it.
        if (obsMode) applyBoardBroadcast(e.level, e.deadline);
        break;
      case "forceTimeUp":
        // Unlike "board", both sides apply this the same way — the control tab relies on this
        // very echo to run it too (dev/testPanel.ts's forceTimeUpBtn doesn't call it directly).
        forceTimeUp();
        break;
      case "resetLeaderboard":
        // Same both-sides-apply-via-echo pattern as "forceTimeUp".
        clearScores();
        resetStreak();
        renderLeaderboard();
        break;
    }
  };
  // Reconnects handled server-side (it keeps broadcasting once it reconnects to TikTok);
  // this only needs to notice if the browser's own socket to OUR server drops.
  ws.onclose = () => {
    setConnectionStatus("offline");
    setTimeout(connectTikTok, 5000);
  };
  ws.onerror = () => ws.close();
}
connectTikTok();
