import type { RuleEffect } from './rules';

export interface UpgradeDef {
  label: string;
  /** One short line on the card. */
  description: string;
  /** How many times it can be taken in one run. */
  maxStacks: number;
  /** What one stack does: rule effects, applied once per stack (data only, no code per upgrade). */
  effects: readonly RuleEffect[];
}

/**
 * Upgrades (Phase 20): after each level the player picks one of a few,
 * kept for the rest of the run. Measured with the balance bot; see
 * DECISIONS.md.
 */
export const UPGRADES = {
  quickPing: {
    label: 'QUICK PING',
    description: 'Ping cooldown −15%.',
    maxStacks: 3,
    effects: [{ key: 'pingCooldown', mul: 0.85 }],
  },
  quickBeam: {
    label: 'QUICK BEAM',
    description: 'Charged beam cooldown −20%.',
    maxStacks: 2,
    effects: [{ key: 'beamCooldown', mul: 0.8 }],
  },
  wideBeam: {
    label: 'WIDE BEAM',
    description: 'Charged beam 10° wider.',
    maxStacks: 2,
    effects: [{ key: 'beamArc', add: 10 }],
  },
  stoneBelt: {
    label: 'STONE BELT',
    description: 'Start each level with 1 more stone.',
    maxStacks: 3,
    effects: [{ key: 'startStones', add: 1 }],
  },
  wideShock: {
    label: 'WIDE SHOCK',
    description: 'Shockwave stuns 25% farther.',
    maxStacks: 2,
    effects: [{ key: 'shockRadius', mul: 1.25 }],
  },
  quickShock: {
    label: 'QUICK SHOCK',
    description: 'Shockwave cooldown −20%.',
    maxStacks: 2,
    effects: [{ key: 'shockCooldown', mul: 0.8 }],
  },
  softSoles: {
    label: 'SOFT SOLES',
    description: 'Hunters hear your footsteps 20% less far.',
    maxStacks: 2,
    effects: [{ key: 'stepHearing', mul: 0.8 }],
  },
  lightFeet: {
    label: 'LIGHT FEET',
    description: 'Sneak 15% faster.',
    maxStacks: 2,
    effects: [{ key: 'sneakSpeed', mul: 1.15 }],
  },
  longBoots: {
    label: 'LONG BOOTS',
    description: 'Silent Boots last 4 s longer.',
    maxStacks: 2,
    effects: [{ key: 'bootsSeconds', add: 4 }],
  },
  thickSkin: {
    label: 'THICK SKIN',
    description: '+1 HP at the start of each level.',
    // One stack only: it already lifts the basic bot from 89% to 99% (DECISIONS.md, Phase 20).
    maxStacks: 1,
    effects: [{ key: 'maxHp', add: 1 }],
  },
} as const satisfies Record<string, UpgradeDef>;

export type UpgradeId = keyof typeof UPGRADES;

export const UPGRADE_IDS = Object.keys(UPGRADES) as UpgradeId[];

/** Cards offered after each level. */
export const UPGRADE_OFFER_SIZE = 3;
