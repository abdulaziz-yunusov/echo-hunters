import {
  DUEL_VARIANT_ORDER,
  DUEL_VARIANTS,
  type DuelVariantId,
  type VariantChoice,
} from '@/config/duel';
import { GAME } from '@/config/game';
import type { RuleEffect, Rules } from '@/config/rules';
import { deriveSeed, Rng } from '@/core/rng';
import { levelDef } from './level';

/**
 * The rules pipeline (the duel part of Phase 20): the defaults from GAME,
 * then the level's overrides, then a duel variant's effects. Upgrades and
 * modifiers (Phases 20–21) will be more effects in the same format.
 */
export function buildRules({
  level = 1,
  variant,
}: { level?: number; variant?: DuelVariantId } = {}): Rules {
  const rules: Rules = {
    pingCooldown: levelDef(level).overrides?.pingCooldown ?? GAME.abilities.ping.cooldown,
    soundRings: 1,
    soundHearing: 1,
    soundSpeed: 1,
    coreHumInterval: GAME.objectives.coreHumInterval,
    ghostAlpha: null,
  };
  if (variant) applyEffects(rules, DUEL_VARIANTS[variant].effects);
  return rules;
}

/** Apply effects in order (data only: no code per effect). */
export function applyEffects(rules: Rules, effects: readonly RuleEffect[]): Rules {
  for (const e of effects) {
    const current = rules[e.key] ?? 0;
    (rules[e.key] as number) = 'set' in e ? e.set : current * e.mul;
  }
  return rules;
}

/**
 * The variant of a duel round. A fixed choice is just that; RANDOM draws
 * from the round's map seed (its own stream), never the round before's.
 */
export function pickVariant(
  choice: VariantChoice,
  seed: number,
  previous: DuelVariantId | null = null,
): DuelVariantId {
  if (choice !== 'random') return choice;
  const pool = DUEL_VARIANT_ORDER.filter((v) => v !== previous);
  return new Rng(deriveSeed(seed, 'variant')).pick(pool);
}
