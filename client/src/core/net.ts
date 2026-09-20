import type { GameEvent } from "../../../shared/types";

/**
 * POSTs a locally-originated event (the moderator's simulated guess/power-up, or the control
 * tab's board choice — see game/progression.ts and dev/testPanel.ts) to the server, which
 * broadcasts it to every connected screen over the same WebSocket a real TikTok event takes.
 * Returns false if the server isn't reachable (e.g. testing with just `npm run dev`, no
 * `dev:server`), so callers can fall back to applying the event locally, single-tab-only.
 */
export async function emitToServer(event: GameEvent): Promise<boolean> {
  try {
    const res = await fetch("/api/emit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(event),
    });
    return res.ok;
  } catch {
    return false;
  }
}
