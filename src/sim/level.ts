import type { HunterTypeId } from '@/config/hunters';
import { ENDLESS, LEVELS, type LevelDef } from '@/config/levels';

/**
 * What a level contains (GDD §7). Levels 1–4 come from the table; after
 * that each level adds a hunter (from the pool, in turn) up to the cap,
 * and keeps the last table level's rule overrides.
 */
export function levelDef(level: number): LevelDef {
  if (level <= LEVELS.length) return LEVELS[Math.max(1, level) - 1];

  const last = LEVELS[LEVELS.length - 1];
  const extra = (level - LEVELS.length) * ENDLESS.extraHuntersPerLevel;
  const hunters = [...last.hunters];
  for (let i = 0; i < extra && hunters.length < ENDLESS.maxHunters; i++) {
    hunters.push(ENDLESS.hunterPool[i % ENDLESS.hunterPool.length]);
  }
  return {
    hunters,
    pickups: ENDLESS.pickups,
    emitters: ENDLESS.emitters,
    overrides: last.overrides,
  };
}

/** Map size multiplier (both sides): 1 for the table levels, then +10% per level, capped. */
export function levelMapScale(level: number): number {
  const beyond = Math.max(0, level - LEVELS.length);
  return Math.min(ENDLESS.maxMapScale, 1 + beyond * ENDLESS.mapGrowthPerLevel);
}

/** The first level a hunter type appears in (null if it never does by `upTo`). */
export function firstLevelWith(type: HunterTypeId, upTo = 30): number | null {
  for (let level = 1; level <= upTo; level++) {
    if (levelDef(level).hunters.includes(type)) return level;
  }
  return null;
}

/** Hunter types met for the first time on this level (level 1's are the tutorial's). */
export function newHunterTypes(level: number): HunterTypeId[] {
  if (level <= 1) return [];
  return [...new Set(levelDef(level).hunters)].filter((t) => firstLevelWith(t, level) === level);
}
