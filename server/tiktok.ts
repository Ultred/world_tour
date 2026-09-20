import { ControlEvent, TikTokLiveConnection, WebcastEvent } from "tiktok-live-connector";
import type { User, WebcastChatMessage, WebcastGiftMessage } from "tiktok-live-connector";
import { cleanGuessWord } from "../shared/guessWord.js";
import type { GameEvent, TikTokUser } from "../shared/types.js";
import { powerUpForGift } from "./giftMap.js";

const toUser = (u: User | undefined): TikTokUser => ({
  id: u?.id ?? "unknown",
  uniqueId: u?.displayId || "unknown",
  nickname: u?.nickname || u?.displayId || "Viewer",
  avatarUrl: u?.avatarThumb?.urlList?.[0],
});

const giftDiamonds = (d: WebcastGiftMessage): number => d.gift?.diamondCount ?? 0;

export interface TikTokConnectionHandle {
  disconnect(): void;
}

/**
 * Connects to a TikTok LIVE and forwards typed `GameEvent`s to `emit`. Gifts
 * are resolved to a power-up here (section 8.7's `giftMap.ts`) — Rose triggers
 * Shuffle specifically, not likes — only `guess`/`powerUp`/`status` events
 * ever leave this module.
 */
export function startTikTok(username: string, emit: (e: GameEvent) => void, eulerApiKey?: string): TikTokConnectionHandle {
  // enableExtendedGiftInfo is deliberately left off: it fetches the room's gift catalog on
  // connect via Euler Stream, which 403s ("requires a Business plan") on the free tier and
  // kills the whole connection — not worth it since `gift.diamondCount` (giftDiamonds() below)
  // already comes for free on every WebcastGiftMessage without it.
  const conn = new TikTokLiveConnection(username, { signApiKey: eulerApiKey });

  conn.on(WebcastEvent.CHAT, (d: WebcastChatMessage) => {
    // Drop pure emoji/symbol/sticker comments here so they never even cross the wire as a
    // guess — cleanGuessWord() is the same filter the client applies before scoring (guess.ts).
    if (!d.content || !cleanGuessWord(d.content)) return;
    emit({ type: "guess", text: d.content, user: toUser(d.user) });
  });

  conn.on(WebcastEvent.GIFT, (d: WebcastGiftMessage) => {
    // Streakable gifts (type 1) fire repeatedly while a combo runs; act only once it ends.
    if (d.gift?.type === 1 && !d.repeatEnd) return;
    const powerUp = powerUpForGift(d.giftId, giftDiamonds(d), d.repeatCount || 1);
    if (powerUp) emit({ type: "powerUp", powerUp, user: toUser(d.user), rand: Math.random() }); // null = free/0-value gift, no-op
  });

  let stopped = false;
  const connect = () => {
    if (stopped) return;
    emit({ type: "status", state: "connecting" });
    conn
      .connect()
      .then(() => emit({ type: "status", state: "connected" }))
      .catch((err: unknown) => {
        console.error("TikTok connect failed:", err);
        scheduleReconnect();
      });
  };
  const scheduleReconnect = () => {
    if (stopped) return;
    emit({ type: "status", state: "reconnecting" });
    setTimeout(connect, 5000); // TODO: exponential back-off if this proves too aggressive live
  };

  conn.on(ControlEvent.DISCONNECTED, scheduleReconnect);
  conn.on(ControlEvent.ERROR, (err: unknown) => console.error("TikTok connection error:", err));

  connect();

  return {
    disconnect() {
      stopped = true;
      conn.disconnect().catch((err: unknown) => console.error("TikTok disconnect error:", err));
    },
  };
}
