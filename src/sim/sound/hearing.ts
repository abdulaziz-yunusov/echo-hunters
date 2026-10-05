import { GAME } from '@/config/game';
import { HUNTER_TYPES, type HunterTypeDef } from '@/config/hunters';
import { SOUND_KINDS, type SoundKindDef } from '@/config/sounds';
import type { EntityId } from '../entities/entity';
import type { GameState, SimContext } from '../gameState';
import { isPlayerId } from '../ai/trail';
import { isMasked } from '../systems/emitters';
import { distanceField } from '../world/pathfinding';
import { hasLineOfSight } from '../world/visibility';
import { waveFaces, type SoundWave } from './soundWave';

/** A sound on its way to a hunter: it arrives at `at`. */
export interface PendingHearing {
  hunterId: EntityId;
  /** Where the hunter should go (the sound's focus, usually its origin). */
  x: number;
  y: number;
  /** Simulation time the sound reaches the hunter. */
  at: number;
}

/**
 * When a sound starts, work out which hunters will hear it and when.
 *
 * A hunter hears a sound if its tags interest the hunter's type, it is not
 * the hunter's own, and its effective distance is within the sound's
 * `hearRadius` (and the hunter's own `hearRange`, if any). A directional sound
 * uses `sideHearRadius` for hunters outside its wedge. The distance is:
 *
 * - in line of sight: the straight distance;
 * - otherwise, with the 'path' model: the corridor distance / `pathFactor`
 *   (sound bends round corners, muffled); the 'los' model hears nothing.
 *
 * The sound arrives after distance / speed seconds, so near hunters react first.
 * Footsteps started in an active emitter's cover are not heard at all.
 */
export function scheduleHearing(state: GameState, wave: SoundWave): void {
  const sound: SoundKindDef = SOUND_KINDS[wave.kind];
  // Lost in machine noise (Phase 17): nobody hears it.
  if (isMasked(state, wave.x, wave.y, sound.tags)) return;
  const tiles = state.layout.tiles;
  let field: Int32Array | null = null;
  // Soft Soles (Phase 20): a player's footsteps carry less far.
  const steps = isPlayerId(wave.owner) && sound.tags.includes('footstep');
  const scale = state.rules.soundHearing * (steps ? state.rules.stepHearing : 1);

  for (const hunter of state.hunters) {
    if (wave.owner === hunter.id) continue;
    const def: HunterTypeDef = HUNTER_TYPES[hunter.type];
    if (!sound.tags.some((t) => def.hears.includes(t))) continue;

    const ahead = waveFaces(wave, hunter.x, hunter.y);
    const reach = ahead ? sound.hearRadius : (sound.sideHearRadius ?? sound.hearRadius);
    // The round's rules (Phase 30) scale how far everything carries.
    const range = Math.min(reach, def.hearRange ?? Infinity) * scale;
    const straight = Math.hypot(hunter.x - wave.x, hunter.y - wave.y);
    if (straight > range) continue;

    let distance: number | null = null;
    if (hasLineOfSight(state.walls, wave.x, wave.y, hunter.x, hunter.y)) {
      distance = straight;
    } else if (state.hearingModel === 'path') {
      field ??= distanceField(tiles, [{ tx: tiles.toTile(wave.x), ty: tiles.toTile(wave.y) }]);
      const steps = field[tiles.index(tiles.toTile(hunter.x), tiles.toTile(hunter.y))];
      if (steps >= 0) distance = (steps * tiles.tileSize) / GAME.hearing.pathFactor;
    }
    if (distance === null || distance > range) continue;

    state.hearings.push({
      hunterId: hunter.id,
      x: wave.focusX,
      y: wave.focusY,
      at: wave.startTime + distance / wave.speed,
    });
  }
}

/** Hand over the sounds that have reached their hunters by now. */
export function deliverHearings(sim: SimContext): void {
  const { state } = sim;
  if (state.hearings.length === 0) return;
  const waiting: PendingHearing[] = [];
  for (const p of state.hearings) {
    if (p.at > state.time) {
      waiting.push(p);
      continue;
    }
    const hunter = state.hunters.find((h) => h.id === p.hunterId);
    if (!hunter) continue;
    hunter.heard = { x: p.x, y: p.y };
    hunter.lastHeard = hunter.heard;
    sim.events.emit('hunterHeard', { hunterId: hunter.id, x: p.x, y: p.y });
  }
  state.hearings = waiting;
}
