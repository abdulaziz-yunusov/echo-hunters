import { GAME } from '@/config/game';
import { HUNTER_TYPES, type HunterTypeDef } from '@/config/hunters';
import { SOUND_KINDS } from '@/config/sounds';
import type { EntityId } from '../entities/entity';
import type { GameState, SimContext } from '../gameState';
import { distanceField } from '../world/pathfinding';
import { hasLineOfSight } from '../world/visibility';
import type { SoundWave } from './soundWave';

/** A sound on its way to a hunter: it arrives at `at`. */
export interface PendingHearing {
  hunterId: EntityId;
  /** Where the sound came from. */
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
 * `hearRadius` (and the hunter's own `hearRange`, if any):
 *
 * - in line of sight: the straight distance;
 * - otherwise, with the 'path' model: the corridor distance / `pathFactor`
 *   (sound bends round corners, muffled); the 'los' model hears nothing.
 *
 * The sound arrives after distance / speed seconds, so near hunters react first.
 */
export function scheduleHearing(state: GameState, wave: SoundWave): void {
  const sound = SOUND_KINDS[wave.kind];
  const tiles = state.layout.tiles;
  let field: Int32Array | null = null;

  for (const hunter of state.hunters) {
    if (wave.owner === hunter.id) continue;
    const def: HunterTypeDef = HUNTER_TYPES[hunter.type];
    if (!sound.tags.some((t) => def.hears.includes(t))) continue;

    const range = Math.min(sound.hearRadius, def.hearRange ?? Infinity);
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
      x: wave.x,
      y: wave.y,
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
