/** GDD §4 "memory ghosting": how visible revealed walls stay after fading. */
export const DIFFICULTIES = {
  easy: { ghostAlpha: 0.1 },
  hard: { ghostAlpha: 0 },
} as const;

export type DifficultyId = keyof typeof DIFFICULTIES;

export const DEFAULT_DIFFICULTY: DifficultyId = 'easy';
