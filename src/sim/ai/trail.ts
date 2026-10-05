import { HUNTER_COMMON } from '@/config/hunters';
import { SOUND_KINDS, type SoundKindDef } from '@/config/sounds';
import { GUEST_ID, PLAYER_ID, type EntityId } from '../entities/entity';
import type { GameState } from '../gameState';
import type { SoundWave } from '../sound/soundWave';
import { isMasked } from '../systems/emitters';

/** Where a player's footstep was heard, and when (Phase 19: what the Tracker follows). */
export interface TrailPoint {
  owner: EntityId;
  x: number;
  y: number;
  /** Sim time of the step. */
  time: number;
}

export function isPlayerId(id: EntityId | null): boolean {
  return id === PLAYER_ID || id === GUEST_ID;
}

/**
 * Remember a player's footstep (any `footstep`-tagged sound: steps and wall
 * bumps). Silent movement leaves nothing, and neither do steps lost in sound
 * cover or Decoy Steps (nobody walked there).
 */
export function recordTrail(state: GameState, wave: SoundWave): void {
  const sound: SoundKindDef = SOUND_KINDS[wave.kind];
  if (wave.decoy || !isPlayerId(wave.owner) || !sound.tags.includes('footstep')) return;
  if (isMasked(state, wave.x, wave.y, sound.tags)) return;
  state.trail.push({ owner: wave.owner!, x: wave.x, y: wave.y, time: wave.startTime });
}

/** Forget steps older than `trailLife`. The trail is in time order, so they are at the front. */
export function pruneTrail(state: GameState): void {
  const oldest = state.time - HUNTER_COMMON.trailLife;
  let drop = 0;
  while (drop < state.trail.length && state.trail[drop].time < oldest) drop++;
  if (drop > 0) state.trail.splice(0, drop);
}

/** The trail point at (x, y), if a step was heard exactly there (a heard footstep's origin). */
export function trailPointAt(state: GameState, x: number, y: number): TrailPoint | null {
  for (let i = state.trail.length - 1; i >= 0; i--) {
    const p = state.trail[i];
    if (p.x === x && p.y === y) return p;
  }
  return null;
}

/**
 * The step after `from` on the same player's trail, or null when the trail
 * ends there or is lost: the next step is more than `maxGap` px away (the
 * player sneaked, or was quiet in cover, in between).
 */
export function nextTrailPoint(
  state: GameState,
  from: TrailPoint,
  maxGap: number,
): TrailPoint | null {
  const next = state.trail.find((p) => p.owner === from.owner && p.time > from.time);
  if (!next) return null;
  return Math.hypot(next.x - from.x, next.y - from.y) <= maxGap ? next : null;
}
