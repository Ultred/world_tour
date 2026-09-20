import type { Difficulty, Level } from "./types";

// Runtime pacing (WORD_TOUR_PROTOTYPE.md section 6.6): cycle difficulty in a
// "wave" so a session never becomes a wall of hard boards back to back.
const DIFFICULTY_WAVE: readonly Difficulty[] = [1, 2, 3, 2, 4, 3, 5];

function shuffled<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy;
}

/**
 * Picks the next level to play: a shuffle-bag per difficulty (every level in
 * that difficulty is played once before any repeat), stepping through the
 * difficulty wave above, and avoiding an immediate repeat of the same seed
 * pool or featured word where the bag has another option.
 */
class LevelBag {
  private byDifficulty = new Map<Difficulty, Level[]>();
  private bags = new Map<Difficulty, Level[]>();
  private waveIndex = 0;
  private playedIds = new Set<string>();
  private lastLevel: Level | null = null;

  load(levels: Level[]): void {
    this.byDifficulty.clear();
    this.bags.clear();
    for (const level of levels) {
      const list = this.byDifficulty.get(level.difficulty) ?? [];
      list.push(level);
      this.byDifficulty.set(level.difficulty, list);
    }
  }

  /** Nearest difficulty that actually has levels loaded — covers a small/partial set during early testing. */
  private nearestAvailableDifficulty(wanted: Difficulty): Difficulty {
    if (this.byDifficulty.get(wanted)?.length) return wanted;
    const available = [...this.byDifficulty.keys()];
    if (!available.length) throw new Error("LevelBag: no levels loaded");
    return available.reduce((a, b) => (Math.abs(b - wanted) < Math.abs(a - wanted) ? b : a));
  }

  next(): Level {
    const wanted = DIFFICULTY_WAVE[this.waveIndex % DIFFICULTY_WAVE.length]!;
    this.waveIndex++;
    const difficulty = this.nearestAvailableDifficulty(wanted);

    let bag = this.bags.get(difficulty);
    if (!bag || bag.length === 0) {
      bag = shuffled(this.byDifficulty.get(difficulty)!);
      this.bags.set(difficulty, bag);
    }

    let picked = bag.pop()!;
    // Swap for a different pick if the bag has one and this pick would repeat the last board.
    if (bag.length > 0 && this.lastLevel && this.repeatsLast(picked)) {
      const swapIdx = bag.findIndex((l) => !this.repeatsLast(l));
      if (swapIdx !== -1) {
        const swapped = bag.splice(swapIdx, 1, picked)[0]!;
        picked = swapped;
      }
    }

    this.playedIds.add(picked.id);
    this.lastLevel = picked;
    return picked;
  }

  private repeatsLast(level: Level): boolean {
    return !!this.lastLevel && (level.seed === this.lastLevel.seed || level.featured === this.lastLevel.featured);
  }

  get playedCount(): number {
    return this.playedIds.size;
  }
}

export const levelBag = new LevelBag();
