import type { HunterTypeId } from './hunters';
import type { PickupTypeId } from './pickups';

export interface LevelDef {
  hunters: readonly HunterTypeId[];
  pickups: Partial<Record<PickupTypeId, number>>;
  tutorial?: boolean;
  /** Per-level overrides of GAME values. Add fields here as levels need them. */
  overrides?: {
    pingCooldown?: number;
  };
}

/** GDD §7 hand-made levels. After the last one, ENDLESS rules take over. */
export const LEVELS: readonly LevelDef[] = [
  { hunters: ['stalker'], pickups: { stoneBag: 1 }, tutorial: true },
  { hunters: ['stalker', 'stalker'], pickups: { stoneBag: 1, silentBoots: 1 } },
  { hunters: ['stalker', 'listener'], pickups: { stoneBag: 2, heart: 1 } },
  {
    hunters: ['stalker', 'listener', 'sprinter'],
    pickups: { stoneBag: 2, silentBoots: 1 },
    overrides: { pingCooldown: 3 },
  },
];

/** Level 5+: generated from the last hand-made level. */
export const ENDLESS = {
  extraHuntersPerLevel: 1,
  maxHunters: 8,
  hunterPool: ['stalker', 'sprinter', 'listener'] as readonly HunterTypeId[],
  mapGrowthPerLevel: 0.1,
  maxMapScale: 1.6,
  pickups: { stoneBag: 2, heart: 1, silentBoots: 1 } as LevelDef['pickups'],
};
