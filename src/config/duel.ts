import type { HunterTypeId } from './hunters';
import type { RuleEffect } from './rules';

/** How a duel variant's map differs from a classic one (unset = GAME.duel / GAME defaults). */
export interface VariantMap {
  /** Signal Cores on the map. */
  cores?: number;
  /** Cores a player must carry to the beacon. */
  coresToWin?: number;
  /** How many rooms to carve (cores sit in rooms, so more cores need more of them). */
  rooms?: { min: number; max: number };
  hunters?: readonly HunterTypeId[];
}

export interface DuelVariant {
  label: string;
  /** One line on the round banner and in How to Play. */
  blurb: string;
  /** Rule changes, applied by buildRules. */
  effects: readonly RuleEffect[];
  map: VariantMap;
}

/**
 * Arena variants (Phase 30): each is rule changes plus map settings, data
 * only. The host picks one (or RANDOM) in the lobby.
 */
export const DUEL_VARIANTS = {
  classic: {
    label: 'CLASSIC',
    blurb: 'Carry 2 cores to the beacon first. Two hits and you drop them.',
    effects: [],
    map: {},
  },
  coreRush: {
    label: 'CORE RUSH',
    blurb: '5 cores on the map: carry 3 to win. More to steal.',
    effects: [],
    map: { cores: 5, coresToWin: 3, rooms: { min: 6, max: 7 } },
  },
  hunted: {
    label: 'HUNTED',
    blurb: 'Two Stalkers and a Tracker hunt you both. The Tracker follows footsteps.',
    effects: [],
    map: { hunters: ['stalker', 'stalker', 'tracker'] },
  },
  blackout: {
    label: 'BLACKOUT',
    blurb: 'Explored walls fade to nothing: you only see what your rings show now.',
    effects: [{ key: 'ghostAlpha', set: 0 }],
    map: {},
  },
  heavyAir: {
    label: 'HEAVY AIR',
    blurb: 'Sound crawls at 60% speed: slow rings, slow to be heard.',
    effects: [{ key: 'soundSpeed', mul: 0.6 }],
    map: {},
  },
  echoChamber: {
    label: 'ECHO CHAMBER',
    blurb: 'Every sound is 1.5× bigger and heard 1.5× further. Loud.',
    effects: [
      { key: 'soundRings', mul: 1.5 },
      { key: 'soundHearing', mul: 1.5 },
    ],
    map: {},
  },
} as const satisfies Record<string, DuelVariant>;

export type DuelVariantId = keyof typeof DUEL_VARIANTS;

export const DUEL_VARIANT_ORDER = Object.keys(DUEL_VARIANTS) as DuelVariantId[];

/** What the host picks: one variant, or a different random one each round. */
export type VariantChoice = DuelVariantId | 'random';

export const VARIANT_CHOICES: readonly VariantChoice[] = [...DUEL_VARIANT_ORDER, 'random'];

export const DEFAULT_VARIANT_CHOICE: VariantChoice = 'classic';

export function isVariant(value: unknown): value is DuelVariantId {
  return typeof value === 'string' && value in DUEL_VARIANTS;
}
