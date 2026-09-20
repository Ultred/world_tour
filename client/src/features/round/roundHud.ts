import { dom, mk } from "../../core/dom";
import { MODIFIER_CHIP_LABEL, MODIFIER_LABEL, MODIFIER_THEME, type RoundModifier } from "./modifiers";

export type TimerColorState = "green" | "amber" | "red";

/** Deliberately takes only primitives (no import of `game/round.ts`) — `game/round.ts` calls into
 * this module, so the reverse dependency would create an import cycle between the two. */
export function paintTimerBar(opts: {
  visible: boolean;
  ratio: number; // 0..1 remaining
  label: string; // "1:23"
  color: TimerColorState;
  pulsing: boolean;
}): void {
  dom.roundTimerBar.classList.toggle("hidden", !opts.visible);
  dom.roundTimerBar.classList.toggle("pulsing", opts.pulsing);
  dom.roundTimerFill.style.width = `${Math.round(Math.max(0, Math.min(1, opts.ratio)) * 100)}%`;
  dom.roundTimerFill.classList.toggle("amber", opts.color === "amber");
  dom.roundTimerFill.classList.toggle("red", opts.color === "red");
  dom.roundTimerLabel.textContent = opts.label;
}

/** `modifier` picks the intro's per-modifier theme (icon + colour, see `MODIFIER_THEME`) —
 * `null`/omitted shows the plain "GET READY" card between rounds. */
export function showIntro(modifier: RoundModifier | null = null): void {
  dom.roundIntro.dataset.modifier = modifier ?? "";
  dom.roundIntroIcon.textContent = modifier ? MODIFIER_THEME[modifier].icon : "";
  dom.roundIntroText.textContent = modifier ? MODIFIER_LABEL[modifier] : "GET READY";
  dom.roundIntro.classList.add("show");
}
export function hideIntro(): void {
  dom.roundIntro.classList.remove("show");
}

/** Persistent modifier indicator near the leaderboard, visible for the whole "playing" phase
 * (see round.ts's renderRoundHud) — so a viewer who tunes in mid-round still sees the twist. */
export function renderModifierChip(modifier: RoundModifier | null): void {
  dom.modifierChip.classList.toggle("hidden", !modifier);
  dom.modifierChip.dataset.modifier = modifier ?? "";
  if (modifier) {
    dom.modifierChipIcon.textContent = MODIFIER_THEME[modifier].icon;
    dom.modifierChipText.textContent = MODIFIER_CHIP_LABEL[modifier];
  }
}

export function showTimeUpBanner(): void {
  dom.timeUpBanner.classList.add("show");
}
export function hideTimeUpBanner(): void {
  dom.timeUpBanner.classList.remove("show");
}

export interface RoundSummaryData {
  reason: "complete" | "timeUp";
  topScorers: { name: string; points: number }[];
  featuredWord: string;
  /** Distinct players who scored at least one point this round. */
  solverCount: number;
}

export function showRoundSummary(data: RoundSummaryData): void {
  dom.roundSummaryTitle.textContent = data.reason === "timeUp" ? "Time's Up!" : "Round Complete!";
  dom.roundSummaryList.replaceChildren();
  if (data.topScorers.length === 0) {
    dom.roundSummaryList.append(mk("li", undefined, "No one scored this round"));
  } else {
    const medals = ["🥇", "🥈", "🥉"];
    data.topScorers.forEach((s, i) => {
      const li = mk("li");
      li.append(mk("span", undefined, `${medals[i] ?? ""} ${s.name}`), mk("b", undefined, `+${s.points}`));
      dom.roundSummaryList.append(li);
    });
  }
  dom.roundSummaryFeatured.textContent = data.featuredWord ? `Featured word: ${data.featuredWord}` : "";
  dom.roundSummarySolvers.textContent =
    data.solverCount === 0
      ? "No one scored this round"
      : `${data.solverCount} player${data.solverCount === 1 ? "" : "s"} scored this round`;
  dom.roundSummary.classList.add("show");
}

export function hideRoundSummary(): void {
  dom.roundSummary.classList.remove("show");
}
