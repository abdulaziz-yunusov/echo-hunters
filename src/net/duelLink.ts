import { GAME } from '@/config/game';
import type { NetMessage } from './protocol';
import type { Transport } from './transport';

/** open: talking. reconnecting: the connection dropped, waiting for it back. closed: for good. */
export type LinkState = 'open' | 'reconnecting' | 'closed';

export interface DuelLinkOptions {
  role: 'host' | 'client';
  /** Shared secret from `hello`: a rejoining client proves it is the same player. */
  token: string;
  /** Client: open a fresh connection to the same room (it may fail; it is retried). */
  reconnect?: () => Promise<Transport>;
  /** How long to wait for a dropped connection to come back (s). */
  grace?: number;
  /** Run once the link is closed for good (e.g. free the PeerJS room). */
  onClosed?: () => void;
}

/** Old positions and sounds are worthless after a pause; everything else waits for the rejoin. */
const STALE: readonly NetMessage['t'][] = ['p', 'snd', 'ping', 'pong'];
/** Client: wait this long between attempts to rejoin (s). */
const RETRY_DELAY = 1;
/** Leaving: close the connection this long after the goodbye (s). */
const CLOSE_DELAY = 0.25;
/** Latency is smoothed: this share of each new round trip counts. */
const LATENCY_SMOOTHING = 0.3;

/**
 * The connection to the rival for a whole duel (Phase 31): a Transport that
 * survives the real connection dropping. When it drops, the link waits
 * `grace` seconds (ticked by the scene: the round is frozen meanwhile).
 * The client keeps rejoining the same room; the host keeps the room open
 * and accepts a new connection that starts with `{ t: 'rejoin', token }`.
 * Back in time: listeners hear `onResume` (the host then sends a full
 * snapshot). Too late, or the rival left on purpose (`bye`): `onClose`.
 *
 * It also keeps its own heartbeat: a `ping` every `pingEvery` s, answered
 * with `pong`, which gives the latency for the HUD. A real network loss
 * can take WebRTC half a minute to notice, so silence for `silence` s
 * counts as a drop, unless the rival said they are away (a hidden tab stops
 * sending). Being away is announced here too (`away` / `back`).
 */
export class DuelLink implements Transport {
  private current: Transport | null = null;
  /** The connection that just dropped (a last goodbye may still come through it). */
  private dropping: Transport | null = null;
  private linkState: LinkState = 'open';
  private lost = 0;
  /** The rival said goodbye, or we closed: a drop now is the end. */
  private ended = false;
  private queue: NetMessage[] = [];
  /** This link's own clock (s), advanced by tick(). */
  private clock = 0;
  private lastHeard = 0;
  private nextPing = 0;
  private rtt: number | null = null;
  private meAway = false;
  private rivalIsAway = false;
  private rivalAwayFor = 0;
  private readonly options: DuelLinkOptions;
  private readonly messageHandlers: ((m: NetMessage) => void)[] = [];
  private readonly closeHandlers: (() => void)[] = [];
  private readonly resumeHandlers: (() => void)[] = [];

  constructor(transport: Transport, options: DuelLinkOptions) {
    this.options = options;
    this.attach(transport);
  }

  get state(): LinkState {
    return this.linkState;
  }

  /** Seconds left to get the connection back (while reconnecting). */
  get secondsLeft(): number {
    return Math.max(0, this.grace - this.lost);
  }

  /** Smoothed round trip to the rival (s); null until measured. */
  get latency(): number | null {
    return this.rtt;
  }

  /** This side's tab is hidden (we said so). */
  get away(): boolean {
    return this.meAway;
  }

  /** How long the rival has been away (s); null while they are here. */
  get rivalAway(): number | null {
    return this.rivalIsAway ? this.rivalAwayFor : null;
  }

  /** Tell the rival this side's tab was hidden, or is back. */
  setAway(away: boolean): void {
    if (away === this.meAway) return;
    this.meAway = away;
    this.send({ t: away ? 'away' : 'back' });
  }

  /** The connection goes through a TURN relay (PeerJS only; false otherwise). */
  get viaRelay(): boolean {
    return this.current?.viaRelay ?? false;
  }

  send(message: NetMessage): void {
    if (this.linkState === 'open') this.current?.send(message);
    else if (this.linkState === 'reconnecting' && !STALE.includes(message.t)) {
      this.queue.push(message);
    }
  }

  onMessage(handler: (message: NetMessage) => void): void {
    this.messageHandlers.push(handler);
  }

  onClose(handler: () => void): void {
    this.closeHandlers.push(handler);
  }

  onResume(handler: () => void): void {
    this.resumeHandlers.push(handler);
  }

  /**
   * Leave on purpose. The connection itself closes a moment later, so a
   * goodbye sent just before can still get through on a real network.
   */
  close(): void {
    if (this.linkState === 'closed') return;
    this.ended = true;
    this.linkState = 'closed';
    const last = this.current;
    this.current = null;
    setTimeout(() => {
      last?.close();
      this.options.onClosed?.();
    }, CLOSE_DELAY * 1000);
  }

  /**
   * Call every tick (the scene's clock, so tests are exact): heartbeat and
   * silence while open, the countdown while reconnecting.
   */
  tick(dt: number): void {
    this.clock += dt;
    if (this.rivalIsAway) this.rivalAwayFor += dt;
    if (this.linkState === 'open') {
      if (this.clock >= this.nextPing) {
        this.nextPing = this.clock + GAME.duel.link.pingEvery;
        this.current?.send({ t: 'ping', n: this.clock });
      }
      if (!this.rivalIsAway && this.clock - this.lastHeard > GAME.duel.link.silence) {
        const silent = this.current;
        this.dropped();
        silent?.close(); // so the rival notices too
      }
    } else if (this.linkState === 'reconnecting') {
      this.lost += dt;
      if (this.lost >= this.grace) this.giveUp();
    }
  }

  /** Debug (Phase 31): cut the connection as a network failure would, to try a reconnect. */
  forceDrop(): void {
    this.current?.close();
  }

  /**
   * Host: someone connected to the room. While waiting for the rival to
   * come back, a connection that says `rejoin` with the right token takes
   * over; anything else is turned away.
   */
  offer(transport: Transport): void {
    if (this.linkState !== 'reconnecting') {
      transport.close();
      return;
    }
    let decided = false;
    transport.onMessage((m) => {
      if (decided) return;
      decided = true;
      if (m.t === 'rejoin' && m.token === this.options.token && this.linkState === 'reconnecting') {
        this.resume(transport);
      } else transport.close();
    });
  }

  private get grace(): number {
    return this.options.grace ?? GAME.duel.link.reconnectGrace;
  }

  private attach(transport: Transport): void {
    this.current = transport;
    transport.onMessage((m) => {
      if (transport !== this.current) {
        // A goodbye that comes in just after its connection dropped still counts.
        if (m.t === 'bye' && transport === this.dropping && this.linkState === 'reconnecting') {
          this.ended = true;
          for (const h of this.messageHandlers) h(m);
          this.giveUp();
        }
        return;
      }
      this.lastHeard = this.clock;
      switch (m.t) {
        case 'rejoin':
          return; // only meaningful to offer()
        case 'ping':
          transport.send({ t: 'pong', n: m.n });
          return;
        case 'pong': {
          const sample = Math.max(0, this.clock - m.n);
          this.rtt =
            this.rtt === null ? sample : this.rtt + (sample - this.rtt) * LATENCY_SMOOTHING;
          return;
        }
        case 'bye':
          this.ended = true;
          break;
        case 'away':
          this.rivalIsAway = true;
          this.rivalAwayFor = 0;
          break;
        case 'back':
          this.rivalIsAway = false;
          break;
      }
      for (const h of this.messageHandlers) h(m);
    });
    transport.onClose(() => {
      if (transport === this.current) this.dropped();
    });
  }

  private dropped(): void {
    if (this.linkState !== 'open') return;
    this.dropping = this.current;
    this.current = null;
    if (this.ended) {
      this.giveUp();
      return;
    }
    this.linkState = 'reconnecting';
    this.lost = 0;
    if (this.options.role === 'client') void this.retry();
  }

  /** Client: keep rejoining the room until it works or time runs out. */
  private async retry(): Promise<void> {
    const reconnect = this.options.reconnect;
    while (reconnect && this.linkState === 'reconnecting') {
      try {
        const transport = await reconnect();
        if (this.linkState !== 'reconnecting') {
          transport.close();
          return;
        }
        transport.send({ t: 'rejoin', token: this.options.token });
        this.resume(transport);
        return;
      } catch {
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY * 1000));
      }
    }
  }

  private resume(transport: Transport): void {
    this.attach(transport);
    this.linkState = 'open';
    this.lastHeard = this.clock;
    const queued = this.queue;
    this.queue = [];
    for (const m of queued) transport.send(m);
    for (const h of this.resumeHandlers) h();
  }

  private giveUp(): void {
    if (this.linkState === 'closed') return;
    this.linkState = 'closed';
    this.current?.close();
    this.current = null;
    for (const h of this.closeHandlers) h();
    this.options.onClosed?.();
  }
}
