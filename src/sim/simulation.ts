import type { SoundKindId } from '@/config/sounds';
import { EventBus } from '@/core/events';
import { createPlayer } from './entities/player';
import { PLAYER_ID, type EntityId } from './entities/entity';
import type { GameEvents } from './events';
import type { GameState, SimContext } from './gameState';
import type { PlayerInput } from './playerInput';
import { createWave, updateWaves } from './sound/soundWave';
import { updateAbilities } from './systems/abilities';
import { updatePlayerMovement } from './systems/playerMovement';
import { buildWallGeometry, type WallGeometry } from './world/edges';
import { generateMap, mapOptionsFromConfig, type MapLayout } from './world/mapGen';

/**
 * Runs one round: owns the state, steps the systems in a fixed order and
 * announces what happened through `events`. Pure and deterministic: the
 * same map and inputs always produce the same round.
 */
export class Simulation implements SimContext {
  readonly state: GameState;
  readonly events = new EventBus<GameEvents>();

  constructor(layout: MapLayout, walls: WallGeometry) {
    const spawn = layout.tiles.center(layout.spawns[0]);
    this.state = {
      time: 0,
      tick: 0,
      layout,
      walls,
      player: createPlayer(PLAYER_ID, spawn.x, spawn.y),
      waves: [],
      nextWaveId: 1,
    };
  }

  /** Advance one fixed tick. */
  step(input: PlayerInput, dt: number): void {
    const s = this.state;
    s.tick++;
    s.time += dt;

    // Remember where things were, so renderers can draw between ticks.
    s.player.prevX = s.player.x;
    s.player.prevY = s.player.y;

    updatePlayerMovement(this, s.player, input, dt);
    updateAbilities(this, s.player, input, dt);
    s.waves = updateWaves(s.waves, dt);
  }

  emitSound(kind: SoundKindId, x: number, y: number, owner: EntityId | null): void {
    const s = this.state;
    const wave = createWave(s.walls, s.nextWaveId++, kind, x, y, owner, s.time);
    s.waves.push(wave);
    this.events.emit('soundEmitted', { kind, x, y, owner, time: s.time, wave });
  }
}

/** Generate a map from a seed and start a round on it. */
export function createSimulation(seed: number): Simulation {
  const layout = generateMap(mapOptionsFromConfig(seed));
  return new Simulation(layout, buildWallGeometry(layout.tiles));
}
