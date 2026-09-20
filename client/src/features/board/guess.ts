import { cleanGuessWord } from "../../../../shared/guessWord";
import type { TikTokUser } from "../../../../shared/types";
import { audio } from "../../audio";
import { BIG_JUMP_MS, FEATURED_STAGGER_MS, GOLDEN_TILE_BONUS, JUMP_DURATION_MS, REVEAL_STAGGER_MS, SPEED_ROUND_MULTIPLIER } from "../../core/config";
import { log } from "../../dev/log";
import { getPlayer, state, stageLater } from "../../game/state";
import type { SolveOptions, SolveResult } from "../../game/types";
import { renderLeaderboard, renderStreakBadge } from "../leaderboard/leaderboard";
import { registerSolve } from "../leaderboard/streak";
import { activeModifier } from "../round/modifiers";
import { awardPoints, finishRoundNow, isPlaying, round } from "../round/round";
import { celebrateSolve } from "./celebrations";
import { flashNearBoard } from "./toast";

/**
 * Marks a word solved, schedules its tile-reveal animation and awards points.
 */
export function solvePlacement(user: TikTokUser, word: string, opts: SolveOptions = {}): SolveResult {
  const player = getPlayer(user);
  const placement = state.wordPlacements[word]!;
  placement.solved = true;
  placement.solvedBy = player.id;

  // Rotating round modifiers (features/round/modifiers.ts) — deterministically picked per
  // level, so both the control tab and the ?obs=1 broadcast view apply the identical rule.
  const isGolden = activeModifier.modifier === "goldenTile" && word === activeModifier.goldenWord;
  const longWordHuntZeroed = activeModifier.modifier === "longWordHunt" && word.length < 5;

  const now = Date.now();
  const start = now + (opts.delay || 0);
  const stagger = opts.stagger || REVEAL_STAGGER_MS;
  let newIndex = 0;
  for (let i = 0; i < word.length; i++) {
    const c = placement.cells[i]!;
    const existing = state.grid[c.y]![c.x];
    const isGoldenTile = isGolden && i === activeModifier.goldenIndex;
    if (existing) {
      // tile already shown (crossing word / hint): keep its timing — unless this is the golden
      // tile, which gets the gift-glow "surprise on reveal" flash restarted fresh even though
      // the letter itself was already visible from an earlier crossing word.
      state.grid[c.y]![c.x] = isGoldenTile
        ? { ...existing, owner: player.id, fx: true, golden: true, burst: false, revealAnimStart: now }
        : { ...existing, owner: player.id };
      continue;
    }
    state.grid[c.y]![c.x] = {
      letter: word[i]!,
      owner: player.id,
      revealAnimStart: start + newIndex * stagger,
      fx: isGoldenTile ? true : opts.fx || false,
      golden: isGoldenTile,
      big: !!opts.big,
    };
    audio.tile((start + newIndex * stagger - now) / 1000, newIndex, opts.fx === "soft", !!opts.big);
    newIndex++;
  }
  state.solvedCount++;
  const isFeatured = word === state.targetWord;
  const points = longWordHuntZeroed
    ? 0
    : Math.round((word.length + (isFeatured ? 10 : 0) + (isGolden ? GOLDEN_TILE_BONUS : 0)) * (opts.multiplier ?? 1));
  awardPoints(user, points);
  const endsAt = start + Math.max(0, newIndex - 1) * stagger + (opts.big ? BIG_JUMP_MS : JUMP_DURATION_MS);
  return { points, isFeatured, endsAt };
}

export function completeBoard(delayMs = 2600): void {
  if (state.boardComplete) return;
  state.boardComplete = true;
  round.phase = "complete"; // locks handleGuess/power-ups immediately; the summary appears once the wait below elapses
  const top = Object.values(state.players).sort((a, b) => b.score - a.score).slice(0, 3);
  const medals = ["🥇", "🥈", "🥉"];
  log(`🏆 Board Solved! ${top.map((p, i) => `${medals[i]}${p.name}:${p.score}`).join(" ")}`, "ev-board");
  // never cut a celebration short: wait for any running one to finish
  const wait = Math.max(delayMs, state.stageBusyUntil - Date.now() + 600);
  stageLater(Math.max(0, state.stageBusyUntil - Date.now()), audio.complete); // jingle once the celebration is over
  stageLater(wait, () => finishRoundNow("complete"));
}

/**
 * `via` differentiates the log line's source: a real chat comment vs. a word a gift
 * (Reveal a Letter/Word) force-completed on the viewer's behalf — same scoring either way,
 * just tagged so the event log shows which one happened.
 */
export function handleGuess(user: TikTokUser, rawWord: string, via: "comment" | "gift" = "comment"): void {
  if (!isPlaying()) return; // a stray guess during intro/timeUp/summary doesn't apply to the next board
  const word = cleanGuessWord(rawWord);
  if (!word || word.length < 3) return;
  const name = getPlayer(user).name;
  const src = via === "gift" ? "🎁" : "💬";

  const placement = state.wordPlacements[word];
  if (placement) {
    if (placement.solved) {
      log(`${src} ⚪ ${name}: "${word}" — already found`, "ev-wrong");
      audio.dupe();
      flashNearBoard(`already found: ${word}`, true);
      return;
    }
    // Streaks are stream-wide, not per-player, and only organic chat guesses extend/benefit —
    // a gift-forced reveal (via === "gift") neither breaks nor boosts it. See features/leaderboard/streak.ts.
    // Speed Round's 2x is folded into the same multiplier — solvePlacement only ever sees the
    // final combined number, it doesn't need its own "is this a Speed Round" branch.
    const multiplier = (via === "comment" ? registerSolve() : 1) * (activeModifier.modifier === "speed" ? SPEED_ROUND_MULTIPLIER : 1);
    const long = word.length >= 5;
    const r = solvePlacement(
      user,
      word,
      word === state.targetWord
        ? { fx: true, big: true, stagger: FEATURED_STAGGER_MS, multiplier }
        : long
          ? { fx: true, multiplier }
          : { fx: "soft", multiplier },
    );
    if (r.isFeatured) {
      log(`${src} 🎯 ${name} solved the FEATURED WORD "${word}"! +${r.points}`, "ev-target");
    } else if (long) {
      log(`${src} 🎆 ${name}: "${word}" — Firework! (+${r.points})`, "ev-solve");
    } else {
      log(`${src} ✅ ${name}: "${word}" — Solved (+${r.points})`, "ev-solve");
    }
    celebrateSolve(getPlayer(user), word, r, long);
    if (!r.isFeatured) audio.solve(Math.max(0, (r.endsAt - Date.now()) / 1000), long); // the featured word has its own fanfare
    renderLeaderboard();
    renderStreakBadge();
    if (state.solvedCount >= Object.keys(state.wordPlacements).length) completeBoard();
    return;
  }

  if (state.currentLevel?.bonusWords.includes(word)) {
    if (state.usedBonusWords.has(word)) {
      log(`${src} ⚪ ${name}: "${word}" — bonus already claimed`, "ev-wrong");
      audio.dupe();
      flashNearBoard(`already claimed: ${word}`, true);
      return;
    }
    state.usedBonusWords.add(word);
    // Keeps the streak alive (a bonus-word guess is still a correct organic guess), but the flat
    // +2 reward itself is never multiplied — the bonus stays a simple, unmultiplied extra.
    if (via === "comment") registerSolve();
    awardPoints(user, 2);
    audio.bonus();
    log(`${src} ⭐ ${name}: "${word}" — Bonus Word! (+2)`, "ev-bonus");
    flashNearBoard(`⭐ Bonus: ${word}`, false, true);
    renderLeaderboard();
    renderStreakBadge();
    return;
  }

  audio.wrong();
  log(`${src} ❌ ${name}: "${word}" — Wrong Guess`, "ev-wrong");
  flashNearBoard(`✗ ${word}`, true);
}
