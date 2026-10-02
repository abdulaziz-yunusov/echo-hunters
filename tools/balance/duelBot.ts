import { AUDIO_SOUNDS } from '@/config/audio';
import { GAME } from '@/config/game';
import type { SoundKindId } from '@/config/sounds';
import type { Vec2 } from '@/core/geometry';
import type { SoundEmitted } from '@/sim/events';
import type { PlayerInput } from '@/sim/playerInput';
import type { Simulation } from '@/sim/simulation';
import { frontPassedOver } from '@/sim/sound/soundWave';
import { coresNeeded, isLockedFor } from '@/sim/systems/duel';
import { hasLineOfSight } from '@/sim/world/visibility';
import { Bot } from './bot';

/** Rival sounds that happen away from the rival (a thrown stone lands elsewhere). */
const DECOY_SOUNDS: readonly SoundKindId[] = ['stoneImpact'];
/** A heard or seen position is worth chasing for this long (s). */
const CHASE_MEMORY = 8;
/** Shock only at a position at most this old (s). */
const SHOCK_FRESH = 0.5;
/** Arrived where the rival was last known (px): nobody there, stop chasing it. */
const GIVE_UP = 24;

/** Where the rival was heard or seen, and when (sim time). */
export interface Sighting extends Vec2 {
  time: number;
}

/**
 * The careful bot with duel goals: take the nearest free core, head for the
 * beacon with enough of them, chase the carrier when the rival has woken the
 * beacon, and shock the rival when it is in reach and in sight.
 *
 * It plays fair: it knows where the rival is only from the rival's sounds
 * it could hear (the player's audio range) and from rings passing over the
 * rival (the pale outline a player would see). Never from the state directly.
 */
export class DuelBot extends Bot {
  private rivalAt: Sighting | null = null;
  private readonly off: () => void;

  constructor(sim: Simulation) {
    super(sim, 'careful');
    this.off = sim.events.on('soundEmitted', (s) => this.hear(s));
  }

  /** Where the rival was last heard or seen; null if never. */
  get lastKnownRival(): Readonly<Sighting> | null {
    return this.rivalAt;
  }

  /** Stop listening to the simulation. */
  dispose(): void {
    this.off();
  }

  override input(): PlayerInput {
    this.look();
    const input = super.input();
    const { player, walls, time } = this.sim.state;
    const r = this.rivalAt;
    if (
      !input.shockwave &&
      r &&
      time - r.time <= SHOCK_FRESH &&
      player.shockCooldown <= 0 &&
      dist(player, r) <= GAME.abilities.shockwave.effectRadius &&
      hasLineOfSight(walls, player.x, player.y, r.x, r.y)
    ) {
      input.shockwave = true;
    }
    return input;
  }

  protected override nextTarget(): Vec2 | null {
    const { state } = this.sim;
    const { player, beacon } = state;
    if (player.cores >= coresNeeded(state)) return beacon;
    const chase = this.chaseTarget();
    // The beacon is awake and not for us: the rival carries the cores. Stop them.
    if (beacon.active) return chase ?? beacon;
    const free = state.cores.filter((c) => !c.collected && !isLockedFor(state, c, player.id));
    if (free.length > 0) return this.nearest(free);
    return chase ?? beacon;
  }

  /** The last known rival position, while it is fresh and we aren't standing on it. */
  private chaseTarget(): Vec2 | null {
    const r = this.rivalAt;
    const { player, time } = this.sim.state;
    if (!r || time - r.time > CHASE_MEMORY || dist(player, r) <= GIVE_UP) return null;
    return r;
  }

  /** A rival sound within earshot tells where they are. */
  private hear(s: SoundEmitted): void {
    const { player, rival, time } = this.sim.state;
    if (!rival || s.owner !== rival.id || DECOY_SOUNDS.includes(s.kind)) return;
    if (Math.hypot(s.x - player.x, s.y - player.y) > AUDIO_SOUNDS[s.kind].range) return;
    this.rivalAt = { x: s.x, y: s.y, time };
  }

  /** A ring (not the rival's own) passing over the rival shows their outline. */
  private look(): void {
    const { rival, waves, time } = this.sim.state;
    if (!rival) return;
    const dt = 1 / GAME.loop.tickRate;
    for (const w of waves) {
      if (w.owner === rival.id || !frontPassedOver(w, rival.x, rival.y, dt)) continue;
      this.rivalAt = { x: rival.x, y: rival.y, time };
      return;
    }
  }
}

function dist(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
