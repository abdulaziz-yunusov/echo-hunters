/**
 * How the practice rival plays (Phase 26). Each level is the same duel bot
 * with different limits, so a level is data only.
 *
 * - reactionDelay (s): how long before it acts on anything new: a sound or
 *   outline of the rival, or a new goal (the next core, the beacon, a chase).
 * - hearing: share of a player's audio range within which it hears the
 *   rival and the hunters (1 = a player with headphones).
 * - shockAccuracy (0..1): chance it waits until the rival is really in
 *   reach; otherwise it fires too early and misses.
 * - tools: throws decoy stones (and, from Phase 29, uses duel tools).
 * - pace: share of full walking speed (a new player feels their way along).
 *
 * Hard is the careful duel bot of Phase 25, unchanged.
 */
export const DUEL_BOTS = {
  easy: {
    label: 'EASY',
    reactionDelay: 1.5,
    hearing: 0.6,
    shockAccuracy: 0.3,
    tools: false,
    pace: 0.8,
  },
  normal: {
    label: 'NORMAL',
    reactionDelay: 0.6,
    hearing: 0.8,
    shockAccuracy: 0.65,
    tools: true,
    pace: 0.92,
  },
  hard: { label: 'HARD', reactionDelay: 0, hearing: 1, shockAccuracy: 1, tools: true, pace: 1 },
} as const satisfies Record<string, DuelBotLevel>;

export interface DuelBotLevel {
  label: string;
  reactionDelay: number;
  hearing: number;
  shockAccuracy: number;
  tools: boolean;
  pace: number;
}

export type DuelBotId = keyof typeof DUEL_BOTS;

export const DUEL_BOT_ORDER = Object.keys(DUEL_BOTS) as DuelBotId[];

export const DEFAULT_DUEL_BOT: DuelBotId = 'normal';
