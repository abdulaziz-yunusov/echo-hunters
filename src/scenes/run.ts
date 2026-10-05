import type { DifficultyId } from '@/config/difficulty';

/** One play-through: levels in a row until the player dies or quits. */
export interface RunState {
  /** All level maps follow from this seed (see levelSeed). */
  seed: number;
  /** Current level, from 1. */
  level: number;
  /** Score banked from finished levels. */
  score: number;
  /** Fixed for the whole run. */
  difficulty: DifficultyId;
  /** Daily Seed run (Phase 13): the UTC date it belongs to. */
  daily?: string;
  /** A hand-made map (Phase 13), as text: a one-level run that doesn't count for the high score. */
  custom?: string;
}

export function newRun(
  seed: number,
  difficulty: DifficultyId,
  extra: Pick<RunState, 'daily' | 'custom'> = {},
): RunState {
  return { seed, level: 1, score: 0, difficulty, ...extra };
}

/** The run after finishing a level worth `levelScore`. */
export function nextLevel(run: RunState, levelScore: number): RunState {
  return { ...run, level: run.level + 1, score: run.score + levelScore };
}
