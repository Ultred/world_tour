import type { PowerUp } from "../shared/types.js";

/**
 * Value tiers, checked from the highest `min` down. `diamonds` = TikTok coin value of the gift.
 *   1–4   → Reveal a Letter   (small gifts other than Rose, which is overridden to Shuffle below)
 *   5–19  → Reveal a Word
 *   20+   → Reveal All Words  (no upper limit)
 * Edit `min` to move the boundaries (e.g. min: 6 if a 5-coin gift should still reveal a letter).
 */
export const GIFT_TIERS = [
  { min: 20, powerUp: "revealAll" },
  { min: 5, powerUp: "revealWord" },
  { min: 1, powerUp: "revealLetter" },
] as const satisfies readonly { min: number; powerUp: PowerUp }[];

/**
 * Rose — TikTok's cheapest gift (1 diamond) — is the dedicated Shuffle trigger, not a value tier.
 * giftId 5655 is Rose's well-known id across the tiktok-live-connector community; not yet confirmed
 * against a real Rose event on this account — log `giftId`/`gift.name` once on a real gift to verify.
 */
const ROSE_GIFT_ID = "5655";

/** Per-gift overrides by giftId; these win over the value tiers above. */
export const GIFT_MAP: Record<string, PowerUp> = {
  [ROSE_GIFT_ID]: "shuffle",
};

/**
 * Which power-up does this gift trigger?
 * The tier is chosen from the TOTAL value of the gift event (diamonds × combo count),
 * so 20 Roses (20 × 1) is still Shuffle (the override matches on giftId, not value) —
 * a combo just re-fires the override once per completed streak, same as any other gift.
 */
export function powerUpForGift(giftId: string, diamonds: number, count = 1): PowerUp | null {
  const override = GIFT_MAP[giftId];
  if (override) return override;
  const total = diamonds * Math.max(1, count);
  for (const tier of GIFT_TIERS) if (total >= tier.min) return tier.powerUp;
  return null; // free / 0-value gifts do nothing
}
