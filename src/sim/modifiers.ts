import { LEVELS } from '@/config/levels';
import { MODIFIER_IDS, MODIFIER_ROLL, type ModifierId } from '@/config/modifiers';
import { deriveSeed, Rng } from '@/core/rng';
import { levelDef } from './level';

/**
 * A level's modifier (Phase 21). Hand-made levels have the one set in
 * LEVELS, if any. From MODIFIER_ROLL.fromLevel each generated level rolls
 * on its own stream (`modifiers-<level>` of the run seed): a modifier with
 * `chance`, never the same as the level before's. So a run seed (and a
 * Daily Run) always has the same modifiers.
 */
export function levelModifier(runSeed: number, level: number): ModifierId | null {
  if (level <= LEVELS.length) return levelDef(level).modifier ?? null;
  let previous = levelDef(LEVELS.length).modifier ?? null;
  let current: ModifierId | null = null;
  for (let l = LEVELS.length + 1; l <= level; l++) {
    current = null;
    if (l >= MODIFIER_ROLL.fromLevel) {
      const rng = new Rng(deriveSeed(runSeed, `modifiers-${l}`));
      if (rng.next() < MODIFIER_ROLL.chance) {
        current = rng.pick(MODIFIER_IDS.filter((id) => id !== previous));
      }
    }
    previous = current;
  }
  return current;
}
