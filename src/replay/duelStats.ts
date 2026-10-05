import { GAME } from '@/config/game';
import { REPLAY } from '@/config/replay';
import type { Replay, ReplayTrack } from './replay';

/** One player's numbers for a duel round (Phase 27). */
export interface DuelPlayerStats {
  /** Cores picked up, steals included. */
  cores: number;
  /** Cores picked up that the rival had dropped. */
  steals: number;
  /** Times this player hit the rival. */
  hits: number;
  /** Pings and beams. */
  pings: number;
  stones: number;
  /** Distance walked (px), teleports left out. */
  distance: number;
  /** Time this player carried more cores than the rival (s). */
  leadTime: number;
}

/** Both players' stats, by player id. */
export type DuelStatsTable = Record<number, DuelPlayerStats>;

export const STAT_ROWS: readonly { key: keyof DuelPlayerStats; label: string }[] = [
  { key: 'cores', label: 'CORES TAKEN' },
  { key: 'steals', label: 'STEALS' },
  { key: 'hits', label: 'HITS LANDED' },
  { key: 'pings', label: 'PINGS' },
  { key: 'stones', label: 'STONES' },
  { key: 'distance', label: 'DISTANCE' },
  { key: 'leadTime', label: 'TIME IN THE LEAD' },
];

export function emptyStats(): DuelPlayerStats {
  return { cores: 0, steals: 0, hits: 0, pings: 0, stones: 0, distance: 0, leadTime: 0 };
}

/**
 * The stats of a duel recording, read only from what the recording holds,
 * so they always agree with the debrief of the same round. Null for a
 * solo recording.
 */
export function duelStats(replay: Replay): DuelStatsTable | null {
  const { duel } = replay;
  if (!duel) return null;
  const a = replay.playerId;
  const b = duel.rivalId;
  const table: DuelStatsTable = { [a]: emptyStats(), [b]: emptyStats() };
  const other = (id: number) => (id === a ? b : a);

  for (const s of replay.sounds) {
    const who = s.owner === null ? undefined : table[s.owner];
    if (!who) continue;
    if (s.kind === 'ping' || s.kind === 'pingBeam') who.pings++;
    else if (s.kind === 'stoneImpact') who.stones++;
  }

  // Lead time in whole milliseconds, the grid the recording travels on, so both players get the same.
  const ms = (t: number) => Math.round(t * 1000);
  const held: Record<number, number> = { [a]: 0, [b]: 0 };
  const leadMs: Record<number, number> = { [a]: 0, [b]: 0 };
  let leader: number | null = null;
  let since = 0;
  const end = ms(replay.times[replay.times.length - 1] ?? 0);
  const settleLead = (now: number) => {
    if (leader !== null) leadMs[leader] += now - since;
    since = now;
    leader = held[a] > held[b] ? a : held[b] > held[a] ? b : null;
  };
  for (const e of duel.events) {
    const who = table[e.by];
    if (e.kind === 'core' && who) {
      who.cores++;
      if (e.from === other(e.by)) who.steals++;
      held[e.by]++;
      settleLead(ms(e.time));
    } else if (e.kind === 'hit' && who && e.target === other(e.by)) {
      who.hits++;
    } else if (e.kind === 'drop' && who) {
      held[e.by] = 0;
      settleLead(ms(e.time));
    }
  }
  settleLead(Math.max(end, since));
  table[a].leadTime = leadMs[a] / 1000;
  table[b].leadTime = leadMs[b] / 1000;

  table[a].distance = walked(replay.player);
  table[b].distance = walked(duel.rival);
  return table;
}

/** Sum of round stats (a series total). */
export function addStats(total: DuelStatsTable, round: DuelStatsTable): DuelStatsTable {
  const sum: DuelStatsTable = { ...total };
  for (const [id, s] of Object.entries(round)) {
    const t = sum[Number(id)] ?? emptyStats();
    const next = emptyStats();
    for (const key of Object.keys(next) as (keyof DuelPlayerStats)[]) next[key] = t[key] + s[key];
    sum[Number(id)] = next;
  }
  return sum;
}

/** A stat as shown on Duel End. */
export function formatStat(key: keyof DuelPlayerStats, value: number): string {
  // A tile is about a metre.
  if (key === 'distance') return `${Math.round(value / GAME.map.tileSize)} m`;
  if (key === 'leadTime') return `${Math.round(value)} s`;
  return `${value}`;
}

/**
 * Path length, leaving out jumps the debrief also treats as teleports.
 * Measured on the 0.1 px grid the recording travels on (replay/wire.ts),
 * so the host and the client get exactly the same number.
 */
function walked(track: ReplayTrack): number {
  const xy = track.xy.map((v) => Math.round(v * 10) / 10);
  let total = 0;
  for (let i = 2; i + 1 < xy.length; i += 2) {
    const d = Math.hypot(xy[i] - xy[i - 2], xy[i + 1] - xy[i - 1]);
    if (d <= REPLAY.teleportDistance) total += d;
  }
  return total;
}
