import { GAME } from '@/config/game';
import type { HunterTypeId } from '@/config/hunters';
import type { LevelDef } from '@/config/levels';
import type { SoundKindId } from '@/config/sounds';
import { EventBus } from '@/core/events';
import { deriveSeed, Rng } from '@/core/rng';
import { setHunterState, updateHunters } from './ai/hunterBrain';
import { createHunter } from './entities/hunter';
import { createBeacon, createCores } from './entities/objectives';
import { createPlayer } from './entities/player';
import { GUEST_ID, PLAYER_ID, type EntityId } from './entities/entity';
import type { GameEvents } from './events';
import type { GameState, SimContext, SimMode } from './gameState';
import { levelDef, levelMapScale } from './level';
import type { PlayerInput } from './playerInput';
import { deliverHearings, scheduleHearing } from './sound/hearing';
import { createWave, growWaves, pruneWaves, type SoundOptions } from './sound/soundWave';
import { updateAbilities } from './systems/abilities';
import { updateCloseCalls } from './systems/closeCalls';
import { updateCombat } from './systems/combat';
import { updateEmitters } from './systems/emitters';
import { updateExtracting, updateObjectives } from './systems/objectives';
import { updatePickups } from './systems/pickups';
import { updatePlayerMovement } from './systems/playerMovement';
import { updateStones } from './systems/stones';
import { buildWallGeometry, type WallGeometry } from './world/edges';
import { generateMap, mapOptionsFromConfig, type MapLayout } from './world/mapGen';
import { placeEmitters } from './world/emitterPlacement';
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
  /** Vents and pipes to place (counts per type); defaults to the level's. */
  emitters?: LevelDef['emitters'];
  /** Solo (default), or which side of a duel this machine is. */
  mode?: SimMode;
  /** Duel: the host starts in the guest's corner and the guest in the host's (series rounds alternate). */
  swapSpawns?: boolean;
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
    const mode = options.mode ?? 'solo';
    const duel = mode !== 'solo';
    const { tiles } = layout;
    // Ids and spawns match on both duel machines: the host is 1 (spawn 0), the guest 2 (spawn 1),
    // or the other way round with swapSpawns.
    const localId = mode === 'client' ? GUEST_ID : PLAYER_ID;
    const swap = duel && options.swapSpawns === true;
    const spawnOf = (id: EntityId) => {
      const index = swap ? 2 - id : id - 1;
      return tiles.center(layout.spawns[Math.max(0, Math.min(index, layout.spawns.length - 1))]);
    };
    const def = levelDef(level);
    const hunterTypes = options.hunters ?? def.hunters;
    const pickups = placePickups(layout, options.pickups ?? def.pickups);
    const pickupTiles = pickups.map((p) => ({ tx: tiles.toTile(p.x), ty: tiles.toTile(p.y) }));

    this.state = {
      level,
      status: 'playing',
      time: 0,
      tick: 0,
      layout,
      walls,
      player: createPlayer(localId, spawnOf(localId).x, spawnOf(localId).y),
      rival: duel
        ? (() => {
            const id = localId === PLAYER_ID ? GUEST_ID : PLAYER_ID;
            return createPlayer(id, spawnOf(id).x, spawnOf(id).y);
          })()
        : null,
      mode,
      duel: duel
        ? {
            coresToWin: GAME.duel.coresToWin,
            hitsToDrop: GAME.duel.hitsToDropCores,
            hits: {},
            winner: null,
            pending: [],
            atBeacon: false,
            extracting: null,
          }
        : null,
      hunters: hunterTypes.slice(0, layout.hunterSpawns.length).map((type, i) => {
        const at = tiles.center(layout.hunterSpawns[i]);
        return createHunter(FIRST_HUNTER_ID + i, type, at.x, at.y);
      }),
      cores: createCores(layout.cores.map((c) => tiles.center(c))),
      beacon: createBeacon(tiles.center(layout.beacon)),
      pickups,
      emitters: placeEmitters(layout, options.emitters ?? def.emitters ?? {}, pickupTiles),
      stones: [],
      nextStoneId: 1,
      waves: [],
      nextWaveId: 1,
      rng: new Rng(deriveSeed(layout.seed, 'ai')),
      hearings: [],
      rules: { pingCooldown: def.overrides?.pingCooldown ?? GAME.abilities.ping.cooldown },
      hearingModel: GAME.hearing.model,
      stats: { huntersStunned: 0, closeCalls: 0 },
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
    for (const p of s.rival ? [s.player, s.rival] : [s.player]) {
      p.prevX = p.x;
      p.prevY = p.y;
    }
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
      updateExtracting(this, s.player, dt);
      updateEmitters(this, dt);
      // A duel client copies the host's hunters and hits instead of running them.
      if (s.mode !== 'client') {
        updateHunters(this, dt);
        updateCombat(this, dt);
      }
      if (s.mode === 'solo') updateCloseCalls(this);
    }
    if (playing && s.mode !== 'client') deliverHearings(this);
    growWaves(s.waves, dt);
    s.waves = pruneWaves(s.waves);
  }

  emitSound(
    kind: SoundKindId,
    x: number,
    y: number,
    owner: EntityId | null,
    options?: SoundOptions,
  ): void {
    const s = this.state;
    const wave = createWave(s.walls, s.nextWaveId++, kind, x, y, owner, s.time, options);
    s.waves.push(wave);
    if (s.status === 'playing' && s.mode !== 'client') scheduleHearing(s, wave);
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

/**
 * Start one side of a duel (GDD §8): the shared seed gives both machines the
 * same two-spawn map, the same hunters and the same pickups.
 */
export function createDuelSimulation({
  seed,
  role,
  hunters = GAME.duel.hunters,
  swapSpawns = false,
}: {
  seed: number;
  role: 'host' | 'client';
  hunters?: readonly HunterTypeId[];
  /** Series rounds alternate corners (Phase 27). */
  swapSpawns?: boolean;
}): Simulation {
  const layout = generateMap(mapOptionsFromConfig(seed, { players: 2 }));
  return new Simulation(layout, buildWallGeometry(layout.tiles), {
    mode: role,
    swapSpawns,
    hunters,
    pickups: GAME.duel.pickups,
    emitters: GAME.duel.emitters,
  });
}
