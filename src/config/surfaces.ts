import type { SoundKindId } from './sounds';

/** What a floor tile is made of (Phase 16). Stored per tile as its index in SURFACE_IDS. */
export const SURFACE_IDS = ['normal', 'metal', 'soft'] as const;
export type SurfaceId = (typeof SURFACE_IDS)[number];

export interface SurfaceDef {
  /** Footstep sound of the player walking here (sneaking and Silent Boots stay silent). */
  playerStep: SoundKindId;
  /** Footstep sound of a hunter walking here. */
  hunterStep: SoundKindId;
}

/**
 * Metal grates ring out: louder steps, heard further (also a hunter's: an
 * early warning). Moss muffles the player's light steps; hunters are too
 * heavy for it to matter.
 */
export const SURFACES = {
  normal: { playerStep: 'step', hunterStep: 'hunterStep' },
  metal: { playerStep: 'stepMetal', hunterStep: 'hunterStepMetal' },
  soft: { playerStep: 'stepSoft', hunterStep: 'hunterStep' },
} as const satisfies Record<SurfaceId, SurfaceDef>;

/** Where map generation lays surfaces. Counts are for a base-size map and grow with its area. */
export const SURFACE_PLACEMENT = {
  /** Metal patches on the way to cores and the beacon: the risky routes. */
  metalPatches: 5,
  /** Moss patches, started from dead ends and side corridors. */
  softPatches: 6,
  /** Tiles per patch (grown outward from a starting tile). */
  patchSize: 5,
  /** A metal patch starts this many walking steps from a core or the beacon. */
  metalFromObjective: { min: 2, max: 6 },
  /** No metal this close to a player spawn (steps), so the start is never forced loud. */
  metalMinFromSpawn: 6,
};
