import type { TikTokUser } from "../../../shared/types";

const MAX_LEN = 12; // hard cap for a single "word" (tunable)

// Split into grapheme clusters so emoji / accented letters are never cut in half.
const seg = new Intl.Segmenter(undefined, { granularity: "grapheme" });
const truncate = (s: string, max: number): string => {
  const g = [...seg.segment(s)].map((x) => x.segment);
  return g.length <= max ? s : g.slice(0, max).join("") + "…";
};

/**
 * Returns a short display name for on-screen use.
 *  "John Michael Smith"  -> "John"
 *  "  maria_luna99  "    -> "maria_luna99"
 *  "Christopher-Alexander-Montgomery" -> "Christopher-…"  (truncated to MAX_LEN)
 *  "🔥🔥🔥"              -> falls back to the @handle
 *  ""                    -> falls back to the @handle, then "Viewer"
 */
export function getFirstName(user: Pick<TikTokUser, "nickname" | "uniqueId">): string {
  const clean = (v?: string) => (v ?? "").replace(/\s+/g, " ").trim();

  const fromNickname = clean(user.nickname).split(" ")[0] ?? "";
  // must contain at least one letter/number, otherwise it's emoji/symbol-only
  const usable = /[\p{L}\p{N}]/u.test(fromNickname) ? fromNickname : "";

  const name = usable || clean(user.uniqueId) || "Viewer";
  return truncate(name, MAX_LEN);
}
