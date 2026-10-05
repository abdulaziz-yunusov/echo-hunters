import type { HunterTypeId } from './hunters';
import type { EmitterTypeId } from './emitters';
import type { PickupTypeId } from './pickups';
import type { ModifierId } from './modifiers';

/** Prompt sets: the basics on level 1, then one new tool at a time. */
export type TutorialId = 'basics' | 'beam';

export interface LevelDef {
  hunters: readonly HunterTypeId[];
  pickups: Partial<Record<PickupTypeId, number>>;
  /** Vents and dripping pipes (Phase 17): sound cover. None if left out. */
  emitters?: Partial<Record<EmitterTypeId, number>>;
  /** A modifier set by hand (Phase 21); generated levels roll for one (sim/modifiers.ts). */
  modifier?: ModifierId;
  /** Prompts shown during the level (see scenes/tutorial.ts). */
  tutorial?: TutorialId;
  /** Per-level overrides of GAME values. Add fields here as levels need them. */
  overrides?: {
    pingCooldown?: number;
  };
}

/** GDD §7 hand-made levels. After the last one, ENDLESS rules take over. */
export const LEVELS: readonly LevelDef[] = [
  { hunters: ['stalker'], pickups: { stoneBag: 1 }, tutorial: 'basics' },
  // Level 1 (the tutorial) has no cover; it appears from level 2, with the charged ping.
  {
    hunters: ['stalker', 'stalker'],
    pickups: { stoneBag: 1, silentBoots: 1 },
    emitters: { vent: 1, drip: 1 },
    tutorial: 'beam',
  },
  {
    hunters: ['stalker', 'listener'],
    pickups: { stoneBag: 2, heart: 1 },
    emitters: { vent: 2, drip: 1 },
  },
  {
    hunters: ['stalker', 'listener', 'sprinter'],
    pickups: { stoneBag: 2, silentBoots: 1 },
    emitters: { vent: 2, drip: 2 },
    overrides: { pingCooldown: 3 },
  },
];

/** Level 5+: generated from the last hand-made level. */
export const ENDLESS = {
  extraHuntersPerLevel: 1,
  maxHunters: 8,
  /**
   * Added one per level, in this order, up to maxHunters. The Phase 19 hunters
   * come first, one new kind per level (5 Tracker, 6 Echo, 7 Mimic), then more
   * of the old ones. Sprinters are the only hunters faster than the player, so
   * they come last: measured with a bot over 40 maps per level, adding a
   * Sprinter first made level 6 a cliff (78% → 50% success).
   */
  hunterPool: [
    'tracker',
    'echo',
    'mimic',
    'stalker',
    'listener',
    'sprinter',
  ] as readonly HunterTypeId[],
  mapGrowthPerLevel: 0.1,
  maxMapScale: 1.6,
  pickups: { stoneBag: 2, heart: 1, silentBoots: 1 } as LevelDef['pickups'],
  emitters: { vent: 2, drip: 2 } as LevelDef['emitters'],
};
