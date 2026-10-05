import type { RuleEffect } from './rules';

export interface ModifierDef {
  label: string;
  /** One short line on the level banner and Level End. */
  blurb: string;
  /** Rule changes, applied by buildRules (data only, no code per modifier). */
  effects: readonly RuleEffect[];
  /** The reward: the level's score × this. */
  scoreMultiplier: number;
}

/**
 * Level modifiers (Phase 21): from MODIFIER_ROLL.fromLevel, a level may
 * change a rule or two, and pays more for it. Measured with the balance
 * bot; see DECISIONS.md.
 */
export const MODIFIERS = {
  blackout: {
    label: 'BLACKOUT',
    blurb: 'Explored walls fade to nothing, even on Easy.',
    effects: [{ key: 'ghostAlpha', set: 0 }],
    scoreMultiplier: 1.25,
  },
  echoChamber: {
    label: 'ECHO CHAMBER',
    blurb: 'Every ring is twice as big, and every sound carries 1.5× as far.',
    effects: [
      { key: 'soundRings', mul: 2 },
      // ×2 hearing (the plan's) made level 10 a cliff for the bot (−18); see DECISIONS.md.
      { key: 'soundHearing', mul: 1.5 },
    ],
    scoreMultiplier: 1.4,
  },
  heavyAir: {
    label: 'HEAVY AIR',
    blurb: 'Sound crawls at 60% speed: slow rings, slow to be heard.',
    effects: [{ key: 'soundSpeed', mul: 0.6 }],
    // Hunters hear late, which helps; rings crawl, which hurts. A small reward.
    scoreMultiplier: 1.15,
  },
  lowPower: {
    label: 'LOW POWER',
    blurb: 'Pings recharge 50% slower; 2 extra stones to make up for it.',
    effects: [
      { key: 'pingCooldown', mul: 1.5 },
      { key: 'startStones', add: 2 },
    ],
    scoreMultiplier: 1.2,
  },
} as const satisfies Record<string, ModifierDef>;

export type ModifierId = keyof typeof MODIFIERS;

export const MODIFIER_IDS = Object.keys(MODIFIERS) as ModifierId[];

/** Which generated levels get a modifier: from `fromLevel`, each with `chance`. */
export const MODIFIER_ROLL = { fromLevel: 5, chance: 0.5 };
