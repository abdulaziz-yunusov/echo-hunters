/**
 * The rule values a round may change from the defaults: a level's
 * overrides, a duel variant (Phase 30), and later upgrades and modifiers
 * (Phases 20–21). Systems read them from `state.rules`, never from GAME.
 * See sim/rules.ts (`buildRules`).
 */
export interface Rules {
  /** Seconds between pings. */
  pingCooldown: number;
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

/** A change to one rule, as data: multiply it, or set it outright. */
export type RuleEffect = { key: RuleKey; mul: number } | { key: RuleKey; set: number };
