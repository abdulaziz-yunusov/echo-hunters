/** GDD §4 "memory ghosting": how visible revealed walls stay after fading. */
export const DIFFICULTIES = {
  easy: { label: 'EASY', ghostAlpha: 0.1, hint: 'explored walls stay faintly visible' },
  hard: { label: 'HARD', ghostAlpha: 0, hint: 'walls fade to nothing: remember the maze' },
} as const;

export type DifficultyId = keyof typeof DIFFICULTIES;

export const DEFAULT_DIFFICULTY: DifficultyId = 'easy';
