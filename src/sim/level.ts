import { ENDLESS, LEVELS, type LevelDef } from '@/config/levels';

/**
 * What a level contains (GDD §7). Levels 1–4 come from the table; after
 * that each level adds a hunter (from the pool, in turn) up to the cap.
 * Map growth and per-level overrides are wired in Phase 9.
 */
export function levelDef(level: number): LevelDef {
  if (level <= LEVELS.length) return LEVELS[Math.max(1, level) - 1];

  const last = LEVELS[LEVELS.length - 1];
  const extra = (level - LEVELS.length) * ENDLESS.extraHuntersPerLevel;
  const hunters = [...last.hunters];
  for (let i = 0; i < extra && hunters.length < ENDLESS.maxHunters; i++) {
    hunters.push(ENDLESS.hunterPool[i % ENDLESS.hunterPool.length]);
  }
  return { hunters, pickups: ENDLESS.pickups, overrides: last.overrides };
}
