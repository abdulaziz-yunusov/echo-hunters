import { GAME } from '@/config/game';
import { REPLAY } from '@/config/replay';
import type { Simulation } from '@/sim/simulation';
import {
  HUNTER_STATE_CODES,
  PLAYER_SNEAKING,
  type Replay,
  type ReplayMarkKind,
  type ReplayTrack,
} from './replay';

/**
 * Records a solo round as it is played, for the replay screen. It only
 * observes: it reads the state after each tick and listens to events, so
 * it can never change the round.
 *
 * Positions are sampled at REPLAY.sampleHz; events are kept exactly.
 */
export class ReplayRecorder {
  private readonly sim: Simulation;
  private readonly replay: Replay;
  private readonly ticksPerSample: number;
  private readonly unsubscribe: (() => void)[] = [];
  private lastSampledTick = -1;
  private finished = false;

  constructor(sim: Simulation, seed: number) {
    this.sim = sim;
    this.ticksPerSample = Math.max(1, Math.round(GAME.loop.tickRate / REPLAY.sampleHz));
    const { state } = sim;
    this.replay = {
      level: state.level,
      seed,
      layout: state.layout,
      walls: state.walls,
      playerId: state.player.id,
      times: [],
      player: emptyTrack(),
      hunters: state.hunters.map((h) => ({ id: h.id, type: h.type, track: emptyTrack() })),
      sounds: [],
      longestSound: 0,
      marks: [],
      cores: state.cores.map((c) => ({ id: c.id, x: c.x, y: c.y, takenAt: null })),
      pickups: state.pickups.map((p) => ({
        id: p.id,
        type: p.type,
        x: p.x,
        y: p.y,
        takenAt: null,
      })),
      beacon: { x: state.beacon.x, y: state.beacon.y, activeAt: null },
      outcome: null,
    };
    this.listen();
    this.sample();
  }

  /** Call after every simulation step. */
  afterStep(): void {
    const { tick, time } = this.sim.state;
    if (this.finished || time > REPLAY.maxSeconds) return;
    if (tick % this.ticksPerSample === 0) this.sample();
  }

  /** Stop recording and hand over the replay (the same one if called again). */
  finish(): Replay {
    if (this.finished) return this.replay;
    this.finished = true;
    for (const off of this.unsubscribe) off();
    this.unsubscribe.length = 0;
    if (this.sim.state.time <= REPLAY.maxSeconds) this.sample();
    return this.replay;
  }

  private sample(): void {
    const { state } = this.sim;
    if (state.tick === this.lastSampledTick) return;
    this.lastSampledTick = state.tick;
    const r = this.replay;
    r.times.push(state.time);
    const p = state.player;
    push(r.player, p.x, p.y, p.sneaking ? PLAYER_SNEAKING : 0);
    for (const rh of r.hunters) {
      const h = state.hunters.find((x) => x.id === rh.id);
      if (h) push(rh.track, h.x, h.y, HUNTER_STATE_CODES.indexOf(h.state));
    }
  }

  private listen(): void {
    const r = this.replay;
    const { events, state } = this.sim;
    const mark = (kind: ReplayMarkKind, x: number, y: number) =>
      r.marks.push({ kind, time: state.time, x, y });
    const on: typeof events.on = (type, handler) => {
      const off = events.on(type, handler);
      this.unsubscribe.push(off);
      return off;
    };

    on('soundEmitted', ({ wave }) => {
      if (state.time > REPLAY.maxSeconds) return;
      r.sounds.push(wave);
      r.longestSound = Math.max(r.longestSound, wave.maxRadius / wave.speed);
    });
    on('coreCollected', (e) => {
      const core = r.cores.find((c) => c.id === e.coreId);
      if (core) core.takenAt = state.time;
      mark('core', e.x, e.y);
    });
    on('pickupCollected', (e) => {
      const pickup = r.pickups.find((p) => p.id === e.pickupId);
      if (pickup) pickup.takenAt = state.time;
      mark('pickup', e.x, e.y);
    });
    on('beaconActivated', (e) => {
      r.beacon.activeAt = state.time;
      mark('beacon', e.x, e.y);
    });
    on('playerHit', (e) => mark('hit', e.x, e.y));
    on('hunterStunned', (e) => mark('stun', e.x, e.y));
    on('closeCall', (e) => mark('close', e.x, e.y));
    on('roundEnded', (e) => {
      r.outcome = e.status;
      mark('end', state.player.x, state.player.y);
    });
  }
}

function emptyTrack(): ReplayTrack {
  return { xy: [], codes: [] };
}

function push(track: ReplayTrack, x: number, y: number, code: number): void {
  track.xy.push(x, y);
  track.codes.push(code);
}
