/**
 * The rule values a round may change from the defaults: a level's
 * overrides, the run's upgrades (Phase 20), a duel variant (Phase 30), and
 * later level modifiers (Phase 21). Systems read them from `state.rules`,
 * never from GAME. See sim/rules.ts (`buildRules`).
 */
export interface Rules {
  /** Seconds between pings. */
  pingCooldown: number;
  /** Seconds between charged beams. */
  beamCooldown: number;
  /** Width of the charged beam's wedge (degrees). */
  beamArc: number;
  /** Seconds between shockwaves. */
  shockCooldown: number;
  /** How far a shockwave stuns (px). */
  shockRadius: number;
  /** Decoy stones carried at the start of a level. */
  startStones: number;
  /** HP at the start of a level, and the most a heart can heal to. */
  maxHp: number;
  /** Seconds of silence from Silent Boots. */
  bootsSeconds: number;
  /** Sneaking speed (px/s). */
  sneakSpeed: number;
  /** × on how far hunters hear the players' footsteps (steps and wall bumps). */
  stepHearing: number;
  /** × on every sound's ring radius (what it lights). */
  soundRings: number;
  /** × on how far every sound is heard: by hunters, and by the players' ears. */
  soundHearing: number;
  /** × on how fast every sound spreads: its ring, and when hunters hear it. */
  soundSpeed: number;
  /** Seconds between a loose core's hums. */
  coreHumInterval: number;
  /** How visible explored walls stay; null = the player's difficulty setting. */
  ghostAlpha: number | null;
}

export type RuleKey = keyof Rules;

/** Rules that hold a number (all but ghostAlpha's null): the ones effects may add to. */
export type NumericRuleKey = Exclude<RuleKey, 'ghostAlpha'>;

/** A change to one rule, as data: multiply it, add to it, or set it outright. */
export type RuleEffect =
  | { key: RuleKey; mul: number }
  | { key: NumericRuleKey; add: number }
  | { key: RuleKey; set: number };
