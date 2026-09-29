import { GAME } from '@/config/game';
import type { HunterTypeId } from '@/config/hunters';
import type { LevelDef } from '@/config/levels';
import type { SoundKindId } from '@/config/sounds';
import { EventBus } from '@/core/events';
import type { Vec2 } from '@/core/geometry';
import { deriveSeed, Rng } from '@/core/rng';
import { setHunterState, updateHunters } from './ai/hunterBrain';
import { createHunter } from './entities/hunter';
import { createBeacon, createCores } from './entities/objectives';
import { createPlayer } from './entities/player';
import { PLAYER_ID, type EntityId } from './entities/entity';
import type { GameEvents } from './events';
import type { GameState, SimContext } from './gameState';
import { levelDef, levelMapScale } from './level';
import type { PlayerInput } from './playerInput';
import { deliverHearings, scheduleHearing } from './sound/hearing';
import { createWave, growWaves, pruneWaves } from './sound/soundWave';
import { updateAbilities } from './systems/abilities';
import { updateCombat } from './systems/combat';
import { updateObjectives } from './systems/objectives';
import { updatePickups } from './systems/pickups';
import { updatePlayerMovement } from './systems/playerMovement';
import { updateStones } from './systems/stones';
import { buildWallGeometry, type WallGeometry } from './world/edges';
import { generateMap, mapOptionsFromConfig, type MapLayout } from './world/mapGen';
import { placePickups } from './world/pickupPlacement';

/** Hunter ids start here (the player is 1). */
const FIRST_HUNTER_ID = 100;

export interface SimulationOptions {
  /** Level number, from 1 (default 1). */
  level?: number;
  /** Hunter types to spawn; defaults to the level's list. Extra types beyond the map's spawn spots are skipped. */
  hunters?: readonly HunterTypeId[];
  /** Pickups to place (counts per type); defaults to the level's. */
  pickups?: LevelDef['pickups'];
}

/**
 * Runs one round: owns the state, steps the systems in a fixed order and
 * announces what happened through `events`. Pure and deterministic: the
 * same map and inputs always produce the same round.
 */
export class Simulation implements SimContext {
  readonly state: GameState;
  readonly events = new EventBus<GameEvents>();

  constructor(layout: MapLayout, walls: WallGeometry, options: SimulationOptions = {}) {
    const level = options.level ?? 1;
    const { tiles } = layout;
    const spawn = tiles.center(layout.spawns[0]);
    const def = levelDef(level);
    const hunterTypes = options.hunters ?? def.hunters;

    this.state = {
      level,
      status: 'playing',
      time: 0,
      tick: 0,
      layout,
      walls,
      player: createPlayer(PLAYER_ID, spawn.x, spawn.y),
      hunters: hunterTypes.slice(0, layout.hunterSpawns.length).map((type, i) => {
        const at = tiles.center(layout.hunterSpawns[i]);
        return createHunter(FIRST_HUNTER_ID + i, type, at.x, at.y);
      }),
      cores: createCores(layout.cores.map((c) => tiles.center(c))),
      beacon: createBeacon(tiles.center(layout.beacon)),
      pickups: placePickups(layout, options.pickups ?? def.pickups),
      stones: [],
      nextStoneId: 1,
      waves: [],
      nextWaveId: 1,
      rng: new Rng(deriveSeed(layout.seed, 'ai')),
      hearings: [],
      rules: { pingCooldown: def.overrides?.pingCooldown ?? GAME.abilities.ping.cooldown },
      hearingModel: GAME.hearing.model,
      stats: { huntersStunned: 0 },
    };
    for (const h of this.state.hunters) setHunterState(this, h, 'idle');
  }

  /**
   * Advance one fixed tick. Order matters: act, then sounds that have
   * reached hunters are handed over (they react next tick), then rings grow.
   * After the round ends, only sound keeps fading out.
   */
  step(input: PlayerInput, dt: number): void {
    const s = this.state;
    s.tick++;
    s.time += dt;

    // Remember where things were, so renderers can draw between ticks.
    s.player.prevX = s.player.x;
    s.player.prevY = s.player.y;
    for (const h of s.hunters) {
      h.prevX = h.x;
      h.prevY = h.y;
    }

    const playing = s.status === 'playing';
    if (playing) {
      updatePlayerMovement(this, s.player, input, dt);
      updateAbilities(this, s.player, input, dt);
      updateStones(this, dt);
      updatePickups(this, s.player, dt);
      updateObjectives(this, s.player, dt);
      updateHunters(this, dt);
      updateCombat(this, dt);
    }
    if (playing) deliverHearings(this);
    growWaves(s.waves, dt);
    s.waves = pruneWaves(s.waves);
  }

  emitSound(kind: SoundKindId, x: number, y: number, owner: EntityId | null, focus?: Vec2): void {
    const s = this.state;
    const wave = createWave(s.walls, s.nextWaveId++, kind, x, y, owner, s.time, focus);
    s.waves.push(wave);
    if (s.status === 'playing') scheduleHearing(s, wave);
    this.events.emit('soundEmitted', { kind, x, y, owner, time: s.time, wave });
  }
}

/**
 * Map seed of a level. A whole run follows from one seed: the same run seed
 * always gives the same sequence of maps.
 */
export function levelSeed(runSeed: number, level: number): number {
  return deriveSeed(runSeed, `level-${level}`);
}

/** Start a level of a run: generate its map and set up the round. */
export function createSimulation({
  seed,
  level,
  hunters,
}: {
  seed: number;
  level: number;
  /** Override the level's hunters (tests, sandbox). */
  hunters?: readonly HunterTypeId[];
}): Simulation {
  const options = mapOptionsFromConfig(levelSeed(seed, level), { scale: levelMapScale(level) });
  const layout = generateMap(options);
  return new Simulation(layout, buildWallGeometry(layout.tiles), { level, hunters });
}
