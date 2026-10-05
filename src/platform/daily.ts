import { hashString } from '@/core/rng';
import { DIFFICULTIES, type DifficultyId } from '@/config/difficulty';

/**
 * Daily Seed (Phase 13): everyone who plays today plays the same run. The
 * day is the UTC date, so players in every time zone share it.
 */
export function dailyDate(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/** The run seed of a day. */
export function dailySeed(date: string): number {
  return hashString(`pulse-daily-${date}`);
}

/** A result to paste into a chat: day, how far, the score, the difficulty, and where to play. */
export function dailyResult(
  r: { date: string; level: number; score: number; difficulty: DifficultyId },
  url: string,
): string {
  const label = DIFFICULTIES[r.difficulty].label;
  return `PULSE: Echo Hunters · Daily ${r.date} · level ${r.level} · ${r.score} pts (${label})\n${url}`;
}
