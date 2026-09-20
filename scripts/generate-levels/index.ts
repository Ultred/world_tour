import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Difficulty, Level } from "../../client/src/features/levels/types";
import { loadDictionary } from "./dictionary";
import { buildLevel, findPools, isPlayablePool, mulberry32, pickDifficultyForPool } from "./levelGenerator";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_LEVELS = path.join(__dirname, "../../client/src/features/levels/levels.generated.json");
const OUT_REPORT = path.join(__dirname, "report.md");

// Fixed seed: re-running this script with the same dictionary + blocklist always
// produces the same levels.generated.json (section 6.8's reproducibility gate).
const SEED = 20260921;
const TARGET_PER_DIFFICULTY: Record<Difficulty, number> = { 1: 100, 2: 100, 3: 100, 4: 100, 5: 100 };
const MIN_BONUS_WORDS = 5; // section 6.8: "each level has >= 5 bonus words"
const ALL_DIFFICULTIES: Difficulty[] = [1, 2, 3, 4, 5];

function main(): void {
  console.log("Loading dictionary…");
  const dict = loadDictionary();
  console.log(`  ${dict.length} candidate words after cleaning.`);

  console.log("Finding seed pools…");
  const allPools = findPools(dict);
  console.log(`  ${allPools.length} unique letter pools (5-7 letters).`);

  const rnd = mulberry32(SEED);
  const shuffledPools = [...allPools].sort(() => rnd() - 0.5);

  const levels: Level[] = [];
  const counts: Record<Difficulty, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  const rejected = { noDifficulty: 0, notPlayable: 0, layoutFailed: 0, tooFewBonusWords: 0 };
  const usedSignatures = new Set<string>();
  let nextId = 1;

  for (const pool of shuffledPools) {
    if (ALL_DIFFICULTIES.every((d) => counts[d] >= TARGET_PER_DIFFICULTY[d])) break;
    if (usedSignatures.has(pool.signature)) continue;

    const difficulty = pickDifficultyForPool(pool);
    if (!difficulty) {
      rejected.noDifficulty++;
      continue;
    }
    if (counts[difficulty] >= TARGET_PER_DIFFICULTY[difficulty]) continue;

    if (!isPlayablePool(pool, dict)) {
      rejected.notPlayable++;
      continue;
    }

    const id = `L${String(nextId).padStart(4, "0")}`;
    const level = buildLevel(pool.seed, dict, difficulty, id, rnd);
    if (!level) {
      rejected.layoutFailed++;
      continue;
    }
    if (level.bonusWords.length < MIN_BONUS_WORDS) {
      rejected.tooFewBonusWords++;
      continue;
    }

    usedSignatures.add(pool.signature);
    levels.push(level);
    counts[difficulty]++;
    nextId++;

    if (levels.length % 50 === 0) console.log(`  ${levels.length} levels so far…`);
  }

  console.log(`Generated ${levels.length} levels.`);
  writeFileSync(OUT_LEVELS, JSON.stringify(levels, null, 2));

  const report = [
    "# Level generation report",
    "",
    `Generated: ${new Date().toISOString()}`,
    `Seed: ${SEED}`,
    `Dictionary size (after cleaning): ${dict.length}`,
    `Candidate pools found: ${allPools.length}`,
    "",
    "## Levels per difficulty",
    ...ALL_DIFFICULTIES.map((d) => `- Difficulty ${d}: ${counts[d]} / ${TARGET_PER_DIFFICULTY[d]}`),
    "",
    "## Rejected",
    `- No qualifying difficulty for this pool's rank/length: ${rejected.noDifficulty}`,
    `- Pool not playable (vowels/hard-consonants/too few formable words): ${rejected.notPlayable}`,
    `- Layout generator couldn't place the selected words: ${rejected.layoutFailed}`,
    `- Fewer than ${MIN_BONUS_WORDS} bonus words: ${rejected.tooFewBonusWords}`,
    "",
    "## Sample levels",
    ...levels
      .slice(0, 15)
      .map((l) => `- **${l.id}** (D${l.difficulty}) ${l.letters.join("")} → ${l.words.join(", ")} [+${l.bonusWords.length} bonus]`),
  ].join("\n");
  writeFileSync(OUT_REPORT, report);

  console.log(`Wrote ${levels.length} levels to ${OUT_LEVELS}`);
  console.log(`Wrote report to ${OUT_REPORT}`);
}

main();
