/**
 * Reduces a raw chat comment to just its letters — the single source of truth for what counts
 * as a guess "word" on both sides of the wire. Strips emoji, punctuation, digits and whitespace,
 * so an emoji-only or emoji-decorated comment ("🔥🔥🔥" or "CAT🔥") never looks like spam: it
 * either reduces to nothing (server skips forwarding it; see server/tiktok.ts) or to the plain
 * word underneath (client still applies its own minimum-length check; see game/guess.ts).
 */
export function cleanGuessWord(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z]/g, "");
}
