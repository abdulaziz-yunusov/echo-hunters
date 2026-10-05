import {
  DUEL_VARIANT_ORDER,
  DUEL_VARIANTS,
  type DuelVariantId,
  type VariantChoice,
} from '@/config/duel';
import { GAME } from '@/config/game';
import { MODIFIERS, type ModifierId } from '@/config/modifiers';
import type { RuleEffect, Rules } from '@/config/rules';
import { PICKUP_TYPES } from '@/config/pickups';
import { SOUND_KINDS } from '@/config/sounds';
import { UPGRADES, type UpgradeId } from '@/config/upgrades';
import { deriveSeed, Rng } from '@/core/rng';
import { levelDef } from './level';

/**
 * The rules pipeline: the defaults from GAME, then the level's overrides,
 * then the run's upgrades (Phase 20, one pass per stack, in the order
 * picked), then the level's modifier (Phase 21), then a duel variant's
 * effects. All of them are effects in the same data format.
 */
export function buildRules({
  level = 1,
  variant,
  upgrades = [],
  modifier = null,
}: {
  level?: number;
  variant?: DuelVariantId;
  upgrades?: readonly UpgradeId[];
  modifier?: ModifierId | null;
} = {}): Rules {
  const { abilities, player } = GAME;
  const rules: Rules = {
    pingCooldown: levelDef(level).overrides?.pingCooldown ?? abilities.ping.cooldown,
    beamCooldown: abilities.beam.cooldown,
    beamArc: SOUND_KINDS.pingBeam.arc,
    shockCooldown: abilities.shockwave.cooldown,
    shockRadius: abilities.shockwave.effectRadius,
    startStones: player.startStones,
    maxHp: player.hp,
    bootsSeconds: PICKUP_TYPES.silentBoots.duration,
    sneakSpeed: player.sneakSpeed,
    stepHearing: 1,
    soundRings: 1,
    soundHearing: 1,
    soundSpeed: 1,
    coreHumInterval: GAME.objectives.coreHumInterval,
    ghostAlpha: null,
  };
  // Stacks past an upgrade's cap do nothing (offers never exceed it anyway).
  const taken = new Map<UpgradeId, number>();
  for (const id of upgrades) {
    const n = (taken.get(id) ?? 0) + 1;
    taken.set(id, n);
    if (n <= UPGRADES[id].maxStacks) applyEffects(rules, UPGRADES[id].effects);
  }
  if (modifier) applyEffects(rules, MODIFIERS[modifier].effects);
  if (variant) applyEffects(rules, DUEL_VARIANTS[variant].effects);
  return rules;
}

/** Apply effects in order (data only: no code per effect). */
export function applyEffects(rules: Rules, effects: readonly RuleEffect[]): Rules {
  for (const e of effects) {
    const current = rules[e.key] ?? 0;
    (rules[e.key] as number) = 'set' in e ? e.set : 'add' in e ? current + e.add : current * e.mul;
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
