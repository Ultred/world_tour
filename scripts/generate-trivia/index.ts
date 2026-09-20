import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { TriviaQuestion } from "../../shared/types";
import { mulberry32 } from "../../client/src/features/board/layout";
import { loadDictionary, type DictWord } from "../generate-levels/dictionary";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_TRIVIA = path.join(__dirname, "../../client/src/features/trivia/trivia.generated.json");
const OUT_REPORT = path.join(__dirname, "report.md");

// Fixed seed: re-running this script with the same dictionary + WordNet data always produces
// the same trivia.generated.json — same reproducibility gate as generate-levels/index.ts.
const SEED = 20260921;
const TARGET_COUNT = 200;
// Skips the ~200 most common words (pronouns/prepositions/etc. — their WordNet glosses are
// grammatical descriptions like "used to..." that make poor trivia) and anything rarer than
// rank 9000 (keeps every answer/distractor a word a general audience would recognize).
const MIN_RANK = 200;
const MAX_RANK = 9000;
const MIN_DEF_LEN = 15;
const MAX_DEF_LEN = 140;
const DISTRACTOR_RANK_WINDOW = 150; // widened (doubled) until 3 distractors are found

/** Strips a plural/tense suffix — same convention as generate-levels/levelGenerator.ts's `stem`,
 * so a distractor is never just a trivial inflection of the answer (e.g. PLANT vs PLANTS). */
const stem = (w: string): string => w.replace(/(S|ED|ING|ER)$/, "");

interface WordnetDefinition {
  glossary: string;
  meta: { synsetType: string };
}
interface WordnetModule {
  init(): Promise<void>;
  lookup(word: string, skipPointers?: boolean): Promise<WordnetDefinition[]>;
}
const wordnet = require("wordnet") as WordnetModule;

/** First sense only, quoted usage examples stripped (WordNet glosses look like
 * `"a state of confusion; "chaos reigned""`) — keeps the part before the first `;`. Rejects
 * defs that are too short/long to read well on stream, or that would give the answer away. */
function cleanGloss(glossary: string, word: string): string | null {
  const firstSense = glossary.split(";")[0]!.trim();
  if (firstSense.length < MIN_DEF_LEN || firstSense.length > MAX_DEF_LEN) return null;
  if (firstSense.toUpperCase().includes(word)) return null;
  return firstSense.charAt(0).toUpperCase() + firstSense.slice(1);
}

/** 3 words close in length + frequency rank to `target`, so wrong answers are plausible
 * instead of obviously-wrong-by-shape — widens the rank window until enough candidates exist. */
function pickDistractors(target: DictWord, dict: DictWord[], used: Set<string>, rnd: () => number): string[] | null {
  const targetStem = stem(target.w);
  for (let window = DISTRACTOR_RANK_WINDOW; window <= DISTRACTOR_RANK_WINDOW * 8; window *= 2) {
    const candidates = dict.filter(
      (d) =>
        d.w !== target.w &&
        !used.has(d.w) &&
        Math.abs(d.w.length - target.w.length) <= 1 &&
        Math.abs(d.rank - target.rank) <= window &&
        stem(d.w) !== targetStem,
    );
    if (candidates.length < 3) continue;
    const shuffled = [...candidates].sort(() => rnd() - 0.5);
    return shuffled.slice(0, 3).map((d) => d.w);
  }
  return null;
}

async function main(): Promise<void> {
  console.log("Loading dictionary…");
  const dict = loadDictionary();
  console.log(`  ${dict.length} candidate words after cleaning.`);

  console.log("Loading WordNet…");
  await wordnet.init();

  const rnd = mulberry32(SEED);
  const candidates = dict.filter((d) => d.rank >= MIN_RANK && d.rank <= MAX_RANK).sort(() => rnd() - 0.5);

  const questions: TriviaQuestion[] = [];
  const used = new Set<string>();
  const rejected = { noDefinition: 0, badGloss: 0, noDistractors: 0 };

  for (const d of candidates) {
    if (questions.length >= TARGET_COUNT) break;
    if (used.has(d.w)) continue;

    let defs: WordnetDefinition[];
    try {
      defs = await wordnet.lookup(d.w.toLowerCase(), true);
    } catch {
      rejected.noDefinition++;
      continue;
    }
    if (!defs.length) {
      rejected.noDefinition++;
      continue;
    }

    const definition = cleanGloss(defs[0]!.glossary, d.w);
    if (!definition) {
      rejected.badGloss++;
      continue;
    }

    const distractors = pickDistractors(d, dict, used, rnd);
    if (!distractors) {
      rejected.noDistractors++;
      continue;
    }

    const choices = [d.w, ...distractors];
    for (let i = choices.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [choices[i], choices[j]] = [choices[j]!, choices[i]!];
    }
    const correctIndex = choices.indexOf(d.w);

    questions.push({ word: d.w, definition, choices, correctIndex });
    used.add(d.w);
    distractors.forEach((w) => used.add(w));
  }

  writeFileSync(OUT_TRIVIA, JSON.stringify(questions, null, 2) + "\n");

  const sample = questions
    .slice(0, 15)
    .map((q) => `- **${q.word}** — ${q.definition} (choices: ${q.choices.join(", ")}; correct: ${q.choices[q.correctIndex]})`)
    .join("\n");
  const report = `# Trivia generation report

Generated ${questions.length} / ${TARGET_COUNT} target questions from ${candidates.length} candidate words (rank ${MIN_RANK}-${MAX_RANK}).

Rejected: ${rejected.noDefinition} no WordNet entry, ${rejected.badGloss} unusable gloss, ${rejected.noDistractors} not enough distractors.

## Sample

${sample}
`;
  writeFileSync(OUT_REPORT, report);
  console.log(`Wrote ${questions.length} questions to ${OUT_TRIVIA}`);
  console.log(`Rejected: ${JSON.stringify(rejected)}`);
}

main();
