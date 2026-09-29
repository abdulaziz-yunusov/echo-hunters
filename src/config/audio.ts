import { GAME } from './game';
import type { SoundKindId } from './sounds';

/** Every synthesized sound the game can make (see audio/synths.ts). No audio files. */
export const SYNTHS = [
  'ping',
  'step',
  'hunterStep',
  'stone',
  'throw',
  'shockwave',
  'beacon',
  'wallBump',
  'coreHum',
  'scream',
  'coreCollected',
  'beaconOn',
  'hit',
  'stun',
  'pickup',
  'extract',
  'death',
] as const;

export type SynthName = (typeof SYNTHS)[number];

export interface SpatialSoundDef {
  synth: SynthName;
  /** Silent beyond this distance from the player (px). Independent of what hunters hear. */
  range: number;
  /** 0..1 before distance and muffling. */
  volume: number;
}

/** How each in-world sound is played for the player (GDD §10). */
export const AUDIO_SOUNDS = {
  step: { synth: 'step', range: 220, volume: 0.35 },
  ping: { synth: 'ping', range: 700, volume: 0.55 },
  stoneImpact: { synth: 'stone', range: 700, volume: 0.6 },
  shockwave: { synth: 'shockwave', range: 800, volume: 0.9 },
  // Hunters are heard from much further than their rings reach: the headphone advantage.
  hunterStep: { synth: 'hunterStep', range: 460, volume: 0.9 },
  listenerScream: { synth: 'scream', range: 1500, volume: 1 },
  beacon: { synth: 'beacon', range: 1600, volume: 0.8 },
  wallBump: { synth: 'wallBump', range: 320, volume: 0.6 },
  coreHum: { synth: 'coreHum', range: 280, volume: 0.4 },
} as const satisfies Record<SoundKindId, SpatialSoundDef>;

/** Feedback sounds for game events: played centered, not placed in the world. */
export const AUDIO_EVENTS = {
  coreCollected: { synth: 'coreCollected', volume: 0.6 },
  beaconActivated: { synth: 'beaconOn', volume: 0.7 },
  playerHit: { synth: 'hit', volume: 0.9 },
  hunterStunned: { synth: 'stun', volume: 0.6 },
  pickupCollected: { synth: 'pickup', volume: 0.5 },
  stoneThrown: { synth: 'throw', volume: 0.35 },
  extracted: { synth: 'extract', volume: 0.7 },
  died: { synth: 'death', volume: 0.9 },
} as const satisfies Record<string, { synth: SynthName; volume: number }>;

export const AUDIO = {
  /** Default mix (0..1); the player's own settings are saved. */
  volumes: { master: 0.8, sfx: 1, ambient: 0.6 },
  /** A sound this far to the side (px) is fully in one ear. */
  panRange: 320,
  /** Sounds from behind a wall: quieter and dull. */
  muffled: { gain: 0.45, lowpassHz: 700 },
  /** Ambient drone (GDD §10): rises in pitch as the nearest hunter comes within `range`. */
  drone: {
    baseHz: 55,
    /** Pitch at closest = baseHz x (1 + rise). */
    rise: 0.6,
    range: GAME.ambient.hunterDroneRange,
    quietVolume: 0.16,
    nearVolume: 0.4,
    /** Smoothing time constant for pitch and volume changes (s). */
    glide: 0.25,
  },
};
