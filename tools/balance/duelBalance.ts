import { GAME } from '@/config/game';
import { deriveSeed, Rng } from '@/core/rng';
import { createLoopbackPair } from '@/net/loopback';
import { NetSession } from '@/net/netSession';
import { GUEST_ID, PLAYER_ID, type EntityId } from '@/sim/entities/entity';
import { createDuelSimulation } from '@/sim/simulation';
import { DuelBot } from './duelBot';

/** A duel nobody has won by then counts as a stalemate (s): rounds should end well before. */
export const DUEL_ROUND_LIMIT = 300;
/** Each round gets a lag of 0..MAX_LAG ticks each way, drawn from its seed. */
export const MAX_LAG = 8;

/** How one bot-vs-bot duel went, judged by the host. */
export interface DuelRound {
  seed: number;
  /** Ticks of lag each way. */
  lag: number;
  /** Player id of the winner (1 = host, 2 = client); null = nobody by the limit. */
  winner: EntityId | null;
  /** Round time (s): when it was won, or the limit. */
  seconds: number;
  /** Times the player carrying more cores switched from one to the other. */
  leadChanges: number;
  /** Who took the round's first core; null if nobody did. */
  firstCore: EntityId | null;
  /** Times someone was hit hard enough to drop their cores. */
  drops: number;
}

export interface DuelStats {
  rounds: number;
  /** Share of decided rounds the host won, 0..1 (spawn fairness: 0.5 is fair). */
  hostWin: number;
  /** Round time of the decided rounds (s); NaN if none. */
  medianSeconds: number;
  p90Seconds: number;
  meanLeadChanges: number;
  /** Share of decided rounds won by whoever took the first core, 0..1. */
  firstCoreWins: number;
  meanDrops: number;
  /** Rounds nobody won within DUEL_ROUND_LIMIT. */
  timeouts: number;
}

/** The lag a seed's round is played with. */
export function lagFor(seed: number): number {
  return new Rng(deriveSeed(seed, 'lag')).int(0, MAX_LAG);
}

/**
 * Two duel bots play one round: a host and a client simulation joined by
 * the in-memory loopback, exactly like a real duel. Deterministic: the same
 * seed and lag always give the same round.
 */
export function playDuel(seed: number, lag = lagFor(seed)): DuelRound {
  const link = createLoopbackPair(lag);
  const host = createDuelSimulation({ seed, role: 'host' });
  const client = createDuelSimulation({ seed, role: 'client' });
  const hostNet = new NetSession(host, link.a);
  const clientNet = new NetSession(client, link.b);
  const hostBot = new DuelBot(host);
  const clientBot = new DuelBot(client);

  let firstCore: EntityId | null = null;
  let drops = 0;
  host.events.on('coreCollected', (e) => (firstCore ??= e.by));
  host.events.on('coresDropped', () => drops++);

  const { state } = host;
  const duel = state.duel!;
  let leader: EntityId | null = null;
  let leadChanges = 0;
  const dt = 1 / GAME.loop.tickRate;
  const ticks = DUEL_ROUND_LIMIT * GAME.loop.tickRate;
  for (let i = 0; i < ticks && duel.winner === null; i++) {
    hostNet.tick(dt);
    clientNet.tick(dt);
    host.step(hostBot.input(), dt);
    client.step(clientBot.input(), dt);
    link.pump();

    const mine = state.player.cores;
    const theirs = state.rival!.cores;
    const now = mine > theirs ? PLAYER_ID : theirs > mine ? GUEST_ID : null;
    if (now !== null) {
      if (leader !== null && now !== leader) leadChanges++;
      leader = now;
    }
  }
  hostBot.dispose();
  clientBot.dispose();
  hostNet.dispose();
  clientNet.dispose();
  return {
    seed,
    lag,
    winner: duel.winner,
    seconds: duel.winner === null ? DUEL_ROUND_LIMIT : state.time,
    leadChanges,
    firstCore,
    drops,
  };
}

/** Play seeds 1..maps and sum them up. */
export function measureDuels(maps: number): DuelStats {
  const rounds: DuelRound[] = [];
  for (let seed = 1; seed <= maps; seed++) rounds.push(playDuel(seed));
  return summarize(rounds);
}

export function summarize(rounds: readonly DuelRound[]): DuelStats {
  const decided = rounds.filter((r) => r.winner !== null);
  const times = decided.map((r) => r.seconds).sort((a, b) => a - b);
  const share = (n: number) => (decided.length ? n / decided.length : NaN);
  const mean = (f: (r: DuelRound) => number) =>
    rounds.reduce((s, r) => s + f(r), 0) / Math.max(1, rounds.length);
  return {
    rounds: rounds.length,
    hostWin: share(decided.filter((r) => r.winner === PLAYER_ID).length),
    medianSeconds: percentile(times, 0.5),
    p90Seconds: percentile(times, 0.9),
    meanLeadChanges: mean((r) => r.leadChanges),
    firstCoreWins: share(decided.filter((r) => r.winner === r.firstCore).length),
    meanDrops: mean((r) => r.drops),
    timeouts: rounds.length - decided.length,
  };
}

/** Nearest-rank percentile of sorted values; NaN if empty. */
function percentile(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return NaN;
  return sorted[Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1)];
}

/** A Markdown table in the DECISIONS.md style. */
export function formatDuelTable(s: DuelStats): string {
  const pct = (v: number) => (isNaN(v) ? '–' : `${Math.round(v * 100)}%`);
  const sec = (v: number) => (isNaN(v) ? '–' : v.toFixed(0));
  const rows: [string, string][] = [
    ['Rounds', `${s.rounds}`],
    ['Host wins', pct(s.hostWin)],
    ['Median round (s)', sec(s.medianSeconds)],
    ['90th percentile (s)', sec(s.p90Seconds)],
    ['Lead changes per round', s.meanLeadChanges.toFixed(2)],
    ['First core wins', pct(s.firstCoreWins)],
    ['Drops per round', s.meanDrops.toFixed(2)],
    [`Past ${DUEL_ROUND_LIMIT / 60} min`, pct(s.rounds ? s.timeouts / s.rounds : NaN)],
  ];
  return ['| Duel | |', '|---|---|', ...rows.map(([k, v]) => `| ${k} | ${v} |`)].join('\n');
}
