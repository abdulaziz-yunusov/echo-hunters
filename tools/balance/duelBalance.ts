import type { DuelVariantId, VariantChoice } from '@/config/duel';
import { DUEL_BOTS, type DuelBotId } from '@/config/duelBots';
import { pickVariant } from '@/sim/rules';
import { GAME } from '@/config/game';
import { DUEL_TOOLS, isTool, TOOLS, type ToolId } from '@/config/pickups';
import { deriveSeed, Rng } from '@/core/rng';
import { createLoopbackPair } from '@/net/loopback';
import { NetSession } from '@/net/netSession';
import { GUEST_ID, PLAYER_ID, type EntityId } from '@/sim/entities/entity';
import { createDuelSimulation } from '@/sim/simulation';
import { DuelBot } from '@/bot/duelBot';

/** A duel nobody has won by then counts as a stalemate (s): rounds should end well before. */
export const DUEL_ROUND_LIMIT = 300;
/** Each round gets a lag of 0..MAX_LAG ticks each way, drawn from its seed. */
export const MAX_LAG = 8;

/** How one bot-vs-bot duel went, judged by the host. */
/** Two bot levels: [host, client] in a round, [first, second] in a table. */
export type BotPair = [DuelBotId, DuelBotId];

export interface DuelRound {
  seed: number;
  bots: BotPair;
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
  /** Who first picked up each duel tool that was picked up (Phase 29). */
  tools: Partial<Record<ToolId, EntityId>>;
  /** Tools used, by either player. */
  toolUses: number;
  /** The arena variant (Phase 30). */
  variant: DuelVariantId;
  /** Overtime began before the round was decided. */
  overtime: boolean;
}

export interface DuelStats {
  rounds: number;
  /** The levels compared (the same one twice for a plain bot-vs-bot table). */
  bots: BotPair;
  /** Share of decided rounds the first level won, 0..1. */
  firstBotWin: number;
  /** Share of decided rounds the host won, 0..1 (spawn fairness: 0.5 is fair). */
  hostWin: number;
  /** Round time of the decided rounds (s); NaN if none. */
  medianSeconds: number;
  p90Seconds: number;
  meanLeadChanges: number;
  /** Share of decided rounds won by whoever took the first core, 0..1. */
  firstCoreWins: number;
  meanDrops: number;
  /** Per tool: decided rounds in which someone picked it up, and the share of them its picker won. */
  toolWins: Record<ToolId, { rounds: number; pickerWins: number }>;
  meanToolUses: number;
  /** Share of rounds that went to overtime, 0..1. */
  overtime: number;
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
export function playDuel(
  seed: number,
  lag = lagFor(seed),
  bots: BotPair = ['hard', 'hard'],
  variant: DuelVariantId = 'classic',
): DuelRound {
  const link = createLoopbackPair(lag);
  const host = createDuelSimulation({ seed, role: 'host', variant });
  const client = createDuelSimulation({ seed, role: 'client', variant });
  const hostNet = new NetSession(host, link.a);
  const clientNet = new NetSession(client, link.b);
  const hostBot = new DuelBot(host, { level: bots[0], seed: deriveSeed(seed, 'host-bot') });
  const clientBot = new DuelBot(client, { level: bots[1], seed: deriveSeed(seed, 'client-bot') });

  let firstCore: EntityId | null = null;
  let drops = 0;
  host.events.on('coreCollected', (e) => (firstCore ??= e.by));
  host.events.on('coresDropped', () => drops++);
  const tools: DuelRound['tools'] = {};
  host.events.on('pickupCollected', (e) => {
    if (isTool(e.type)) tools[e.type] ??= e.by;
  });
  let toolUses = 0;
  for (const sim of [host, client]) sim.events.on('toolUsed', () => toolUses++);

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
    bots,
    lag,
    winner: duel.winner,
    seconds: duel.winner === null ? DUEL_ROUND_LIMIT : state.time,
    leadChanges,
    firstCore,
    drops,
    tools,
    toolUses,
    variant,
    overtime: duel.overtimeAt !== null,
  };
}

/**
 * Play seeds 1..maps and sum them up. Two different levels take turns
 * hosting (the first hosts the odd seeds), so neither gets the host's side.
 */
export function measureDuels(
  maps: number,
  bots: BotPair = ['hard', 'hard'],
  variant: VariantChoice = 'classic',
): DuelStats {
  const rounds: DuelRound[] = [];
  for (let seed = 1; seed <= maps; seed++) {
    const pair: BotPair = seed % 2 === 1 ? bots : [bots[1], bots[0]];
    rounds.push(playDuel(seed, lagFor(seed), pair, pickVariant(variant, seed)));
  }
  return summarize(rounds, bots);
}

export function summarize(
  rounds: readonly DuelRound[],
  bots: BotPair = ['hard', 'hard'],
): DuelStats {
  const decided = rounds.filter((r) => r.winner !== null);
  const times = decided.map((r) => r.seconds).sort((a, b) => a - b);
  const share = (n: number) => (decided.length ? n / decided.length : NaN);
  const mean = (f: (r: DuelRound) => number) =>
    rounds.reduce((s, r) => s + f(r), 0) / Math.max(1, rounds.length);
  const winnerLevel = (r: DuelRound) => r.bots[r.winner === PLAYER_ID ? 0 : 1];
  return {
    rounds: rounds.length,
    bots,
    firstBotWin: share(decided.filter((r) => winnerLevel(r) === bots[0]).length),
    hostWin: share(decided.filter((r) => r.winner === PLAYER_ID).length),
    medianSeconds: percentile(times, 0.5),
    p90Seconds: percentile(times, 0.9),
    meanLeadChanges: mean((r) => r.leadChanges),
    firstCoreWins: share(decided.filter((r) => r.winner === r.firstCore).length),
    meanDrops: mean((r) => r.drops),
    toolWins: Object.fromEntries(
      DUEL_TOOLS.map((tool) => {
        const picked = decided.filter((r) => r.tools[tool] !== undefined);
        const won = picked.filter((r) => r.tools[tool] === r.winner).length;
        return [
          tool,
          { rounds: picked.length, pickerWins: picked.length ? won / picked.length : NaN },
        ];
      }),
    ) as DuelStats['toolWins'],
    meanToolUses: mean((r) => r.toolUses),
    overtime: rounds.length ? rounds.filter((r) => r.overtime).length / rounds.length : NaN,
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
  const [a, b] = s.bots.map((id) => DUEL_BOTS[id].label);
  const rows: [string, string][] = [
    ['Rounds', `${s.rounds}`],
    ...(a === b ? [] : ([[`${a} beats ${b}`, pct(s.firstBotWin)]] as [string, string][])),
    ['Host wins', pct(s.hostWin)],
    ['Median round (s)', sec(s.medianSeconds)],
    ['90th percentile (s)', sec(s.p90Seconds)],
    ['Lead changes per round', s.meanLeadChanges.toFixed(2)],
    ['First core wins', pct(s.firstCoreWins)],
    ['Drops per round', s.meanDrops.toFixed(2)],
    ['Tools used per round', s.meanToolUses.toFixed(2)],
    ['Overtime', pct(s.overtime)],
    ...DUEL_TOOLS.map((tool): [string, string] => {
      const t = s.toolWins[tool];
      return [`${TOOLS[tool].label} picker wins`, `${pct(t.pickerWins)} of ${t.rounds}`];
    }),
    [`Past ${DUEL_ROUND_LIMIT / 60} min`, pct(s.rounds ? s.timeouts / s.rounds : NaN)],
  ];
  return ['| Duel | |', '|---|---|', ...rows.map(([k, v]) => `| ${k} | ${v} |`)].join('\n');
}
