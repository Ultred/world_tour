/**
 * Event types shared between the TikTok server (Phase 2) and the game client.
 * See WORD_TOUR_PROTOTYPE.md section 8.3.
 *
 * The server decides which power-up a gift triggers (section 8.7's `giftMap.ts`,
 * Rose → Shuffle, value tiers for the rest) — `GiftEvent` is server-internal
 * only and never sent to the client. Only `GameEvent` (guess/powerUp/status)
 * crosses the WebSocket.
 */

export type PowerUp = "shuffle" | "revealLetter" | "revealWord" | "revealAll";

export interface TikTokUser {
  /** Stable userId — the preferred key for scores (handles/nicknames can change or collide). */
  id: string;
  uniqueId: string;
  nickname: string;
  avatarUrl?: string;
}

export interface GuessEvent {
  type: "guess";
  user: TikTokUser;
  text: string;
}

/** Server-internal only — resolved to a `PowerUpEvent` via `powerUpForGift`, never sent to the client as-is. */
export interface GiftEvent {
  type: "gift";
  user: TikTokUser;
  giftId: string;
  giftName: string;
  /** Value per gift, in diamonds. */
  diamonds: number;
  /** Final streak count. */
  count: number;
}

/** What actually crosses the WebSocket for a gift — the client just runs it. Every real gift
 * (Rose's Shuffle included) has a gifter, but `user` stays optional for the dev panel's plain
 * "Shuffle" button, which has no specific viewer to credit. */
export interface PowerUpEvent {
  type: "powerUp";
  powerUp: PowerUp;
  user?: TikTokUser;
  /** A shared [0,1) value for `revealLetter`/`revealWord`'s random pick, chosen once by
   * whoever originates the event (server or the moderator's dev panel) and reused as-is by
   * every connected screen — never re-rolled locally — so a moderator's broadcast view (OBS)
   * reveals the exact same tile/word the control tab does instead of each independently
   * calling `Math.random()` and diverging. Unused by `shuffle`/`revealAll`. */
  rand?: number;
}

export interface StatusEvent {
  type: "status";
  state: "connecting" | "connected" | "reconnecting" | "offline";
}

export type Difficulty = 1 | 2 | 3 | 4 | 5;

/**
 * A generated level (WORD_TOUR_PROTOTYPE.md section 6) — produced offline by
 * `scripts/generate-levels/` and shipped as `levels.generated.json`. Lives here (not just
 * `client/src/game/levels/types.ts`, which re-exports it) so the generator script and the
 * client always share the exact same shape and can never drift apart.
 */
export interface Level {
  /** e.g. "L0042". */
  id: string;
  /** The seed word the letter pool came from, e.g. "PLANET". */
  seed: string;
  difficulty: Difficulty;
  /** The letter wheel, 5–7 letters. */
  letters: string[];
  /** The longest board word — the featured word / spine. */
  featured: string;
  /** Every word placed on the board, featured first. */
  words: string[];
  /** Every other valid word formable from the pool but not on the board — +2 bonus points. */
  bonusWords: string[];
}

/**
 * Broadcast by the "director" (the moderator's control tab — the one running `game/progression.ts`'s
 * `newBoard`, i.e. the tab that is NOT `?obs=1`) so every other connected screen (the `?obs=1`
 * broadcast view, or any other open tab) mirrors the exact same board and countdown instead of
 * each independently picking its own random level. `deadline` is the same absolute
 * `Date.now()`-based round-end timestamp `round.ts` already uses internally.
 */
export interface BoardEvent {
  type: "board";
  level: Level;
  deadline: number;
}

/**
 * One A/B/C/D trivia question — produced offline by `scripts/generate-trivia/` and shipped as
 * `trivia.generated.json`, the same "generate once, ship as static JSON" pattern as `Level`.
 * `choices` is already shuffled and `correctIndex` already resolved at generation time, so the
 * client never needs to do its own shuffling to stay in sync across screens.
 */
export interface TriviaQuestion {
  /** The answer word — not shown to the client until the reveal beat. */
  word: string;
  /** First-sense definition, cleaned of quoted examples (see the generator). */
  definition: string;
  /** Four words, one of which is `word`. */
  choices: string[];
  correctIndex: number;
}

/**
 * Broadcast by the control tab when a between-boards trivia interlude starts (see
 * `features/trivia/trivia.ts`'s `startTriviaInterlude`) — same "director decides, everyone else
 * mirrors" role as `BoardEvent`, except the question itself is new information that can't be
 * derived from anything already synced, so (unlike the round modifiers) it has to travel over
 * the wire explicitly.
 */
export interface TriviaEvent {
  type: "trivia";
  question: TriviaQuestion;
  deadline: number;
}

/**
 * Dev-only: the control tab's "Force Time's Up" button, relayed so the `?obs=1` broadcast
 * view ends the round at the same instant instead of continuing to count down against the
 * original deadline until the next `BoardEvent` arrives. Never fired by real TikTok activity.
 */
export interface ForceTimeUpEvent {
  type: "forceTimeUp";
}

/**
 * Dev-only: the control tab's "Reset Leaderboard" button, relayed so the `?obs=1` broadcast
 * view wipes its scores at the same instant instead of keeping the old leaderboard until it
 * happens to receive fresh score-changing events. Never fired by real TikTok activity.
 */
export interface ResetLeaderboardEvent {
  type: "resetLeaderboard";
}

/** The client-facing union — what actually arrives over the WebSocket. */
export type GameEvent =
  | GuessEvent
  | PowerUpEvent
  | StatusEvent
  | BoardEvent
  | TriviaEvent
  | ForceTimeUpEvent
  | ResetLeaderboardEvent;
