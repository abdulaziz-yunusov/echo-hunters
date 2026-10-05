import { GAME } from '@/config/game';
import type { DuelStatsTable } from '@/replay/duelStats';
import { GUEST_ID, PLAYER_ID, type EntityId } from '@/sim/entities/entity';
import type { NetMessage } from './protocol';
import type { Transport } from './transport';

/** How one round of a series went. */
export interface RoundResult {
  round: number;
  winner: EntityId;
  /** From the round's recording, once it is here (the client receives it a moment later). */
  stats: DuelStatsTable | null;
}

/** The next round, as the host announced it. */
export interface UpcomingRound {
  seed: number;
  round: number;
  /** Seconds to wait before it starts (0 for a rematch). */
  countdown: number;
}

/**
 * A best-of-N series between the same two players over one connection
 * (Phase 27). It outlives the rounds: each round gets its own simulation
 * and NetSession on this series' transport, and Duel End reads the score,
 * the readiness and the next round from here.
 *
 * The host is the referee here too: when both players are ready, it picks
 * the next map seed and announces it (`next`). Once the series is over,
 * "ready" means a rematch: a new series of the same length, at once.
 */
export class DuelSeries {
  readonly transport: Transport;
  readonly role: 'host' | 'client';
  readonly bestOf: number;
  /** The current (or just finished) round, from 1. */
  round = 1;
  private results: RoundResult[] = [];
  private meReady = false;
  private rivalReady = false;
  private announced: UpcomingRound | null = null;
  private left = false;
  private readonly newSeed: () => number;

  constructor(
    transport: Transport,
    role: 'host' | 'client',
    bestOf: number,
    newSeed: () => number,
  ) {
    this.transport = transport;
    this.role = role;
    this.bestOf = bestOf;
    this.newSeed = newSeed;
    transport.onMessage((m) => this.receive(m));
    transport.onClose(() => (this.left = true));
  }

  /** This machine's player id. */
  get myId(): EntityId {
    return this.role === 'host' ? PLAYER_ID : GUEST_ID;
  }

  get rivalId(): EntityId {
    return this.role === 'host' ? GUEST_ID : PLAYER_ID;
  }

  /** Round wins needed to take the series. */
  get winsNeeded(): number {
    return Math.floor(this.bestOf / 2) + 1;
  }

  wins(id: EntityId): number {
    return this.results.filter((r) => r.winner === id).length;
  }

  /** Who won the series, once someone has. */
  get champion(): EntityId | null {
    for (const id of [PLAYER_ID, GUEST_ID]) if (this.wins(id) >= this.winsNeeded) return id;
    return null;
  }

  get over(): boolean {
    return this.champion !== null;
  }

  /** Rounds finished so far in this series. */
  get history(): readonly RoundResult[] {
    return this.results;
  }

  /** Series rounds alternate spawn corners: even rounds swap them. */
  get swapSpawns(): boolean {
    return this.round % 2 === 0;
  }

  /** The other player left, or the connection dropped. */
  get rivalLeft(): boolean {
    return this.left;
  }

  get ready(): boolean {
    return this.meReady;
  }

  get rivalIsReady(): boolean {
    return this.rivalReady;
  }

  /** The round the host has announced and nobody has started yet. */
  get upcoming(): UpcomingRound | null {
    return this.announced;
  }

  /** The current round has a winner (both sides call this, with the same winner). */
  finishRound(winner: EntityId): void {
    if (this.results.some((r) => r.round === this.round)) return;
    this.results.push({ round: this.round, winner, stats: null });
  }

  /** A round's stats, once its recording is here. */
  setStats(round: number, stats: DuelStatsTable): void {
    const result = this.results.find((r) => r.round === round);
    if (result) result.stats = stats;
  }

  /** "Ready for the next round" (or a rematch, once the series is over). */
  markReady(): void {
    if (this.meReady || this.left) return;
    this.meReady = true;
    this.transport.send({ t: 'ready' });
    this.startIfBothReady();
  }

  /** The announced round is starting: it is now the current one. */
  begin(): UpcomingRound | null {
    const next = this.announced;
    if (!next) return null;
    this.announced = null;
    this.round = next.round;
    return next;
  }

  /** Leave the series on purpose: tell the rival, then close. */
  leave(): void {
    if (!this.left) this.transport.send({ t: 'bye' });
    this.left = true;
    this.transport.close();
  }

  private receive(m: NetMessage): void {
    if (m.t === 'ready') {
      this.rivalReady = true;
      this.startIfBothReady();
    } else if (m.t === 'next' && this.role === 'client') {
      this.announce({ seed: m.seed, round: m.round, countdown: m.countdown });
    } else if (m.t === 'bye') {
      this.left = true;
    }
  }

  /** Host: both ready, so pick the next map and tell the client. */
  private startIfBothReady(): void {
    if (this.role !== 'host' || !this.meReady || !this.rivalReady) return;
    const rematch = this.over;
    const next: UpcomingRound = {
      seed: this.newSeed(),
      round: rematch ? 1 : this.round + 1,
      countdown: rematch ? 0 : GAME.duel.series.countdown,
    };
    this.transport.send({ t: 'next', ...next });
    this.announce(next);
  }

  private announce(next: UpcomingRound): void {
    this.meReady = false;
    this.rivalReady = false;
    // Round 1 again is a rematch: a fresh series.
    if (next.round === 1) this.results = [];
    this.announced = next;
  }
}
