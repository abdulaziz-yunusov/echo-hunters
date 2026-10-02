import { GAME } from '@/config/game';
import type { HunterStateId } from '@/sim/entities/hunter';
import type { SoundEmitted } from '@/sim/events';
import type { Simulation } from '@/sim/simulation';
import {
  clearPending,
  declareWinner,
  grant,
  playerById,
  receiveHit,
  resolveShockwave,
  tryExtract,
  tryGrant,
} from '@/sim/systems/duel';
import type { Replay } from '@/replay/replay';
import { packReplay, unpackReplay } from '@/replay/wire';
import { Interpolator } from './interpolation';
import type { NetMessage } from './protocol';
import type { Transport } from './transport';

/** Hunter ids start at 100 (see simulation.ts); anything else that owns a sound is a player. */
const isHunterId = (id: number | null) => id !== null && id >= 100;

/**
 * Keeps one side of a duel in step with the other (GDD §8 netcode).
 *
 * Both sides: send own position (15 Hz) and own sounds; place the rival
 * from the positions received, drawn slightly in the past so it glides.
 *
 * Host (the referee): runs the hunters; answers "may I take this?";
 * decides hits, drops and the winner; sends its hunters' sounds and a
 * full snapshot (10 Hz) that corrects anything the client got wrong.
 *
 * Client: asks instead of deciding, and applies what the host says.
 */
export class NetSession {
  private readonly sim: Simulation;
  private readonly transport: Transport;
  private readonly isHost: boolean;
  private readonly unsubscribe: (() => void)[] = [];
  private readonly rivalTrack = new Interpolator();
  private readonly hunterTracks = new Map<number, Interpolator>();
  private time = 0;
  private positionTimer = 0;
  private snapshotTimer = 0;
  private closed = false;
  private closeListeners: (() => void)[] = [];
  private recording: Replay | null = null;
  private recordingListeners: ((replay: Replay) => void)[] = [];

  constructor(sim: Simulation, transport: Transport) {
    this.sim = sim;
    this.transport = transport;
    this.isHost = sim.state.mode === 'host';
    transport.onMessage((m) => this.receive(m));
    transport.onClose(() => this.markClosed());

    const on = sim.events.on.bind(sim.events);
    this.unsubscribe.push(on('soundEmitted', (s) => this.shareSound(s)));
    if (this.isHost) {
      this.unsubscribe.push(
        on('coreCollected', (e) => this.send({ t: 'taken', kind: 'core', id: e.coreId, by: e.by })),
        on('pickupCollected', (e) =>
          this.send({ t: 'taken', kind: 'pickup', id: e.pickupId, by: e.by }),
        ),
        on('playerHit', (e) => {
          if (e.target === sim.state.rival?.id) {
            const from = this.sim.state.hunters.find((h) => h.id === e.by) ?? sim.state.player;
            this.send({ t: 'hit', hits: e.hits, fromX: from.x, fromY: from.y });
          }
        }),
        on('coresDropped', (e) =>
          this.send({
            t: 'drop',
            by: e.by,
            cores: e.cores.map((c) => ({ ...c, collected: false })),
          }),
        ),
        on('duelEnded', (e) => this.send({ t: 'end', winner: e.winner })),
      );
    } else {
      this.unsubscribe.push(
        on('takeRequested', (e) => this.send({ t: 'take', kind: e.kind, id: e.id })),
        on('extractRequested', () => this.send({ t: 'extract' })),
      );
    }
  }

  /** The connection dropped (or the rival left). */
  get disconnected(): boolean {
    return this.closed;
  }

  onDisconnect(listener: () => void): void {
    this.closeListeners.push(listener);
  }

  /**
   * Host: send the finished round's recording to the client, for its debrief.
   * Packing takes a moment (it is gzipped), so it goes out shortly after.
   */
  shareRecording(replay: Replay): void {
    packReplay(replay).then(
      (data) => this.send({ t: 'rec', data }),
      () => {}, // no debrief for the client; the duel itself is unaffected
    );
  }

  /** Client: `listener` gets the host's recording once it has arrived (at once if it has). */
  onRecording(listener: (replay: Replay) => void): void {
    if (this.recording) listener(this.recording);
    else this.recordingListeners.push(listener);
  }

  /** Call once per tick, before the simulation steps. */
  tick(dt: number): void {
    this.time += dt;
    const { state } = this.sim;
    const delay = GAME.duel.interpolationDelay;

    const rival = state.rival;
    const at = this.rivalTrack.sample(this.time - delay);
    if (rival && at) {
      rival.x = at.x;
      rival.y = at.y;
    }
    if (!this.isHost) {
      for (const h of state.hunters) {
        const p = this.hunterTracks.get(h.id)?.sample(this.time - delay);
        if (p) {
          h.x = p.x;
          h.y = p.y;
        }
      }
    }

    this.positionTimer -= dt;
    if (this.positionTimer <= 0) {
      this.positionTimer += 1 / GAME.duel.positionSendHz;
      this.send({ t: 'p', x: state.player.x, y: state.player.y });
    }
    if (this.isHost) {
      this.snapshotTimer -= dt;
      if (this.snapshotTimer <= 0) {
        this.snapshotTimer += 1 / GAME.duel.snapshotHz;
        this.sendSnapshot();
      }
    }
  }

  /** Leave on purpose: tell the rival, then close. */
  dispose(): void {
    for (const off of this.unsubscribe) off();
    if (!this.closed) this.send({ t: 'bye' });
    this.closed = true;
    this.transport.close();
  }

  private send(message: NetMessage): void {
    if (!this.closed) this.transport.send(message);
  }

  /** Own sounds go to the rival; the host also sends its hunters' sounds. */
  private shareSound(s: SoundEmitted): void {
    const mine = s.owner === this.sim.state.player.id;
    if (!mine && !(this.isHost && isHunterId(s.owner))) return;
    this.send({
      t: 'snd',
      kind: s.kind,
      x: s.x,
      y: s.y,
      owner: s.owner ?? 0,
      fx: s.wave.focusX,
      fy: s.wave.focusY,
      dir: s.wave.arc?.dir,
    });
  }

  private sendSnapshot(): void {
    const { state } = this.sim;
    const players = [state.player, state.rival].filter((p) => p !== null);
    this.send({
      t: 'snap',
      hunters: state.hunters.map((h) => ({ id: h.id, x: h.x, y: h.y, state: h.state })),
      cores: state.cores.map((c) => ({ id: c.id, x: c.x, y: c.y, collected: c.collected })),
      held: players.map((p) => [p.id, p.cores]),
      hits: players.map((p) => [p.id, state.duel?.hits[p.id] ?? 0]),
      beacon: state.beacon.active,
      winner: state.duel?.winner ?? null,
    });
  }

  private receive(m: NetMessage): void {
    const sim = this.sim;
    const { state } = sim;
    const rivalId = state.rival?.id ?? -1;

    switch (m.t) {
      case 'p':
        this.rivalTrack.push(this.time, m.x, m.y);
        break;
      case 'snd':
        sim.emitSound(m.kind, m.x, m.y, m.owner, { focus: { x: m.fx, y: m.fy }, dir: m.dir });
        // The host decides what the client's shockwave hits.
        if (this.isHost && m.kind === 'shockwave' && m.owner === rivalId) {
          resolveShockwave(sim, m.x, m.y, rivalId);
        }
        break;
      case 'take':
        if (this.isHost && !tryGrant(sim, m.kind, m.id, rivalId)) {
          this.send({ t: 'denied', kind: m.kind, id: m.id });
        }
        break;
      case 'taken':
        if (!this.isHost) grant(sim, m.kind, m.id, m.by);
        break;
      case 'denied':
        if (!this.isHost) clearPending(state, m.kind, m.id);
        break;
      case 'extract':
        if (this.isHost) tryExtract(sim, rivalId);
        break;
      case 'hit':
        if (!this.isHost) receiveHit(sim, m.hits, m.fromX, m.fromY);
        break;
      case 'drop':
        if (!this.isHost) this.applyDrop(m.by, m.cores);
        break;
      case 'snap':
        if (!this.isHost) this.applySnapshot(m);
        break;
      case 'end':
        if (!this.isHost) declareWinner(sim, m.winner);
        break;
      case 'rec':
        if (!this.isHost && !this.recording) void this.receiveRecording(m.data);
        break;
      case 'bye':
        this.markClosed();
        break;
      case 'hello':
        break; // handled by the lobby before the duel starts
    }
  }

  private applyDrop(by: number, cores: { id: number; x: number; y: number }[]): void {
    const { state } = this.sim;
    const who = playerById(state, by);
    if (who) who.cores = 0;
    for (const c of cores) {
      if (!state.cores.some((k) => k.id === c.id)) {
        state.cores.push({
          ...c,
          collected: false,
          humTimer: 1,
          dropped: true,
          lockedFor: by,
          lockedUntil: state.time + GAME.duel.dropLockSeconds,
        });
      }
    }
    this.sim.events.emit('coresDropped', { by, cores });
  }

  /** Client: make everything contested match the host's picture. */
  private applySnapshot(m: Extract<NetMessage, { t: 'snap' }>): void {
    const { state } = this.sim;
    for (const snap of m.hunters) {
      let track = this.hunterTracks.get(snap.id);
      if (!track) {
        track = new Interpolator();
        this.hunterTracks.set(snap.id, track);
      }
      track.push(this.time, snap.x, snap.y);
      const hunter = state.hunters.find((h) => h.id === snap.id);
      if (hunter && hunter.state !== snap.state) {
        hunter.state = snap.state as HunterStateId;
        hunter.stateTime = 0;
      }
    }
    for (const snap of m.cores) {
      const core = state.cores.find((c) => c.id === snap.id);
      if (core) core.collected = snap.collected;
      else state.cores.push({ ...snap, humTimer: 1, dropped: true });
    }
    for (const [id, count] of m.held) {
      const p = playerById(state, id);
      if (p) p.cores = count;
    }
    if (state.duel) {
      for (const [id, hits] of m.hits) state.duel.hits[id] = hits;
      // Anything the host has settled is no longer pending.
      state.duel.pending = state.duel.pending.filter((key) => {
        const [kind, id] = key.split(':');
        const list = kind === 'core' ? state.cores : state.pickups;
        return !list.find((x) => x.id === Number(id))?.collected;
      });
      if (state.player.cores < state.duel.coresToWin) state.duel.extractPending = false;
    }
    if (m.winner !== null) declareWinner(this.sim, m.winner);
  }

  /** Rebuild the host's recording on this side's own copy of the map. */
  private async receiveRecording(data: string): Promise<void> {
    const { layout, walls } = this.sim.state;
    const replay = await unpackReplay(data, layout, walls);
    if (!replay || this.recording) return;
    this.recording = replay;
    for (const listener of this.recordingListeners) listener(replay);
    this.recordingListeners = [];
  }

  private markClosed(): void {
    if (this.closed) return;
    this.closed = true;
    for (const listener of this.closeListeners) listener();
  }
}
