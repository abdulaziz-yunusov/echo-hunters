import type { SoundKindId } from './sounds';

/**
 * Sound cover (Phase 17): machines that make noise on a cycle. While one is
 * active, footsteps (and wall bumps) that start within `maskRadius` of it
 * are lost in the noise: hunters don't hear them. Pings, stones and
 * shockwaves are never masked. Its own sound is ambient (no hunter reacts),
 * and lights the walls around it: free local vision, on its own schedule.
 */
export interface EmitterTypeDef {
  sound: SoundKindId;
  /** Seconds between the starts of two active spells. */
  period: number;
  /** Seconds each spell lasts. */
  activeTime: number;
  /** Footsteps starting this close to it while active are masked (px). */
  maskRadius: number;
}

export const EMITTER_TYPES = {
  /** A ventilation fan: long, wide cover every few seconds. */
  vent: { sound: 'ventHum', period: 6, activeTime: 2.5, maskRadius: 110 },
  /** A dripping pipe: brief, tight cover, often. */
  drip: { sound: 'drip', period: 1.8, activeTime: 0.4, maskRadius: 50 },
} as const satisfies Record<string, EmitterTypeDef>;

export type EmitterTypeId = keyof typeof EMITTER_TYPES;

/** Where map setup puts them. */
export const EMITTER_PLACEMENT = {
  /** Walking steps from every player spawn, at least. */
  minFromSpawn: 6,
  /** Walking steps between two emitters, at least, so their cover doesn't merge. */
  minSpacing: 8,
};
