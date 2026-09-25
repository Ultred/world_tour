import type { TikTokUser } from "../../../../shared/types";
import { audio } from "../../audio";
import { TRIVIA_CORRECT_POINTS, TRIVIA_DURATION_SEC, TRIVIA_REVEAL_MS } from "../../core/config";
import { emitToServer } from "../../core/net";
import { log } from "../../dev/log";
import { getPlayer, stageLater } from "../../game/state";
import { flashNearBoard } from "../board/toast";
import { renderLeaderboard } from "../leaderboard/leaderboard";
import { awardPoints } from "../round/round";
import { paintTimerBar, type TimerColorState } from "../round/roundHud";
import { triviaBag } from "./index";
import { hideTriviaCard, renderTriviaAnswers, revealTriviaAnswer, showTriviaCard } from "./triviaHud";
import type { TriviaQuestion } from "./types";

/**
 * Between-boards A/B/C/D definition trivia (WORD_TOUR_PROTOTYPE.md's "Mystery Word", reframed
 * around data the project actually has — see the plan doc). Deliberately its own small lifecycle,
 * separate from `features/round/round.ts`'s crossword round machinery: it runs entirely between
 * rounds (round.phase is already "complete" the whole time this is active), so it doesn't need
 * to touch round.ts's phase state at all — it just reuses round.ts's `awardPoints` and
 * roundHud.ts's `paintTimerBar` where that's genuinely the same widget, not a new one.
 *
 * Answers are held, not scored live: a comment just locks a viewer into a choice (shown by name
 * under that choice — see triviaHud.ts's renderTriviaAnswers), with no correct/wrong feedback at
 * that point. Scoring only happens once, for everyone at once, when the timer runs out.
 */
interface TriviaState {
  active: boolean;
  question: TriviaQuestion | null;
  deadline: number;
  /** userId -> the held answer — one per user (first answer sticks), not scored until the reveal. */
  answers: Map<string, { user: TikTokUser; name: string; choiceIndex: number }>;
  /** Flips true the instant time's up, before the correct choice is highlighted — closes the
   * window where a comment could just copy the answer that's now visible on screen for free points. */
  revealed: boolean;
}
const trivia: TriviaState = { active: false, question: null, deadline: 0, answers: new Map(), revealed: false };

/** Recomputes the four name lists from `trivia.answers` and repaints them — called on every new answer. */
function refreshAnswerDisplay(): void {
  const byChoice: string[][] = [[], [], [], []];
  for (const { name, choiceIndex } of trivia.answers.values()) byChoice[choiceIndex]?.push(name);
  renderTriviaAnswers(byChoice);
}

export function isTriviaActive(): boolean {
  return trivia.active;
}

/** Control-tab only: picks a question, broadcasts it, and calls `onDone` once the reveal beat finishes. */
export function startTriviaInterlude(onDone: () => void): void {
  const question = triviaBag.next();
  const deadline = Date.now() + TRIVIA_DURATION_SEC * 1000;
  beginTrivia(question, deadline, onDone);
  emitToServer({ type: "trivia", question, deadline });
}

/** `?obs=1` mirror — same question/deadline the control tab already decided, no local choices made. */
export function applyTriviaBroadcast(question: TriviaQuestion, deadline: number): void {
  beginTrivia(question, deadline, () => {});
}

function beginTrivia(question: TriviaQuestion, deadline: number, onDone: () => void): void {
  trivia.active = true;
  trivia.question = question;
  trivia.deadline = deadline;
  trivia.answers = new Map();
  trivia.revealed = false;
  showTriviaCard(question);
  refreshAnswerDisplay(); // clears the name lists from any previous question
  log(`❓ Trivia: ${question.word} — ${question.definition}`, "ev-board");
  stageLater(Math.max(0, deadline - Date.now()), () => revealAndAdvance(onDone));
}

/** The only place trivia points are ever awarded — every held answer gets scored at once, so
 * nobody's correctness is visible (to themselves or anyone reading chat) before this moment. */
function revealAndAdvance(onDone: () => void): void {
  if (!trivia.question) return;
  trivia.revealed = true; // stop accepting answers before the correct choice goes up, not after
  const correctIndex = trivia.question.correctIndex;
  let anyCorrect = false;
  for (const { user, name, choiceIndex } of trivia.answers.values()) {
    if (choiceIndex !== correctIndex) {
      log(`❓❌ ${name} answered wrong`, "ev-wrong");
      continue;
    }
    anyCorrect = true;
    awardPoints(user, TRIVIA_CORRECT_POINTS);
    log(`❓✅ ${name} answered correctly (+${TRIVIA_CORRECT_POINTS})`, "ev-solve");
  }
  if (trivia.answers.size) renderLeaderboard();
  audio[anyCorrect ? "bonus" : "wrong"]();
  revealTriviaAnswer(correctIndex);
  log(`❓ Trivia answer: ${trivia.question.word}`, "ev-board");
  stageLater(TRIVIA_REVEAL_MS, () => {
    hideTriviaCard();
    trivia.active = false;
    trivia.question = null;
    onDone();
  });
}

/** Visual-only countdown, called every frame from `stage.ts`'s `animLoop` (mirrors
 * `round.ts`'s `renderRoundHud`) — reuses the same timer-bar widget, which sits idle
 * between rounds (round.phase is "complete" the whole time trivia is active). */
export function renderTriviaHud(now: number): void {
  if (!trivia.active) return;
  const remaining = Math.max(0, trivia.deadline - now);
  const ratio = remaining / (TRIVIA_DURATION_SEC * 1000);
  const totalSec = Math.ceil(remaining / 1000);
  const mm = Math.floor(totalSec / 60);
  const ss = totalSec % 60;
  const color: TimerColorState = ratio > 0.5 ? "green" : ratio > 0.2 ? "amber" : "red";
  paintTimerBar({ visible: true, ratio, label: `${mm}:${ss.toString().padStart(2, "0")}`, color, pulsing: totalSec <= 5 });
}

// Deliberately not reusing cleanGuessWord/handleGuess (guess.ts) — its 3-letter minimum would
// reject a single-letter answer. Accepts a leading A-D letter or 1-4 digit, tolerating leading
// punctuation (so "a)", "C!", "-d" etc. all parse the same as a bare letter) — but the first
// actual letter/digit in the comment must be the answer itself, not a word starting with one.
const ANSWER_RE = /^[^A-Za-z0-9]*([A-Da-d]|[1-4])/;

export function parseAnswerIndex(rawText: string): number | null {
  const m = rawText.match(ANSWER_RE);
  if (!m) return null;
  const c = m[1]!.toUpperCase();
  if (c >= "A" && c <= "D") return c.charCodeAt(0) - 65;
  return Number(c) - 1; // "1".."4" -> 0..3
}

export function handleTriviaAnswer(user: TikTokUser, rawText: string): void {
  if (!trivia.active || !trivia.question || trivia.revealed) return;
  const idx = parseAnswerIndex(rawText);
  if (idx == null) return; // not a recognizable answer — ordinary chat noise during the interlude, not a wrong guess
  const player = getPlayer(user);
  if (trivia.answers.has(player.id)) return; // one answer per user — first one sticks

  const letter = String.fromCharCode(65 + idx);
  trivia.answers.set(player.id, { user, name: player.name, choiceIndex: idx });
  refreshAnswerDisplay();
  audio.pick(); // dedicated neutral "locked in" click — never the correct/wrong SFX
  flashNearBoard(`${player.name} picked ${letter}`, false);
  log(`❓ ${player.name} picked ${letter}`, "ev-board");
}
