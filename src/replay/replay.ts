import type { DuelVariantId } from '@/config/duel';
import { EMITTER_TYPES, type EmitterTypeId } from '@/config/emitters';
import type { HunterTypeId } from '@/config/hunters';
import type { PickupTypeId } from '@/config/pickups';
import type { Vec2 } from '@/core/geometry';
import type { HunterStateId } from '@/sim/entities/hunter';
import type { RoundStatus } from '@/sim/gameState';
import type { SoundWave } from '@/sim/sound/soundWave';
import type { WallGeometry } from '@/sim/world/edges';
import type { MapLayout } from '@/sim/world/mapGen';

/** Hunter states as small numbers, for compact tracks. */
export const HUNTER_STATE_CODES: readonly HunterStateId[] = [
  'idle',
  'investigate',
  'search',
  'attack',
  'stunned',
];

/** Player flags stored per sample. */
export const PLAYER_SNEAKING = 1;

/** Where one thing was at every sample, plus a small number per sample (flags or state code). */
export interface ReplayTrack {
  /** x0, y0, x1, y1, … one pair per sample. */
  xy: number[];
  /** One value per sample. */
  codes: number[];
}

export interface ReplayHunter {
  id: number;
  type: HunterTypeId;
  track: ReplayTrack;
}

export type ReplayMarkKind =
  | 'core'
  | 'pickup'
  | 'beacon'
  | 'hit'
  | 'stun'
  | 'close'
  | 'end'
  /** Duel overtime began (Phase 30). */
  | 'overtime';

/** Something worth pointing out on the timeline. */
export interface ReplayMark {
  kind: ReplayMarkKind;
  time: number;
  x: number;
  y: number;
}

/** An objective or pickup: where it was and when it was taken (null = never). */
export interface ReplayThing extends Vec2 {
  id: number;
  takenAt: number | null;
  /** When it appeared, if not at the start (a duel core dropped by a player who was hit). */
  appearedAt?: number;
}

export interface ReplayPickup extends ReplayThing {
  type: PickupTypeId;
}

/** A vent or pipe, and when each of its noisy spells started (ascending). */
export interface ReplayEmitter extends Vec2 {
  id: number;
  type: EmitterTypeId;
  spells: number[];
}

/**
 * Who did what in a duel, for the stats (Phase 27).
 * - core: `by` took a core; `from` is who had dropped it (null: one of the map's own).
 * - hit: `by` (a player or a hunter) hit `target`.
 * - drop: `by` was hit too often and dropped every core they carried.
 */
export type DuelEvent =
  | { kind: 'core'; time: number; by: number; from: number | null }
  | { kind: 'hit'; time: number; by: number; target: number }
  | { kind: 'drop'; time: number; by: number };

/** A duel recording (made by the host) also has the other player, the winner and who did what. */
export interface ReplayDuel {
  rivalId: number;
  rival: ReplayTrack;
  winner: number | null;
  events: DuelEvent[];
  /** The round's arena variant (Phase 30): the debrief shows it, and its sound rules rebuild the rings. */
  variant: DuelVariantId;
  /** When overtime began; null if it never did. */
  overtimeAt: number | null;
}

/**
 * Everything needed to watch a finished round again, recorded while it was
 * played (see ReplayRecorder). Plain data; the queries below read it.
 */
export interface Replay {
  level: number;
  /** Run seed, for the title. */
  seed: number;
  layout: MapLayout;
  walls: WallGeometry;
  /** The recorded player's entity id (to tell their sounds from hunters'). */
  playerId: number;
  /** Simulation time of each sample (s), ascending. */
  times: number[];
  player: ReplayTrack;
  hunters: ReplayHunter[];
  /** Every sound of the round, in start order. Only their fixed fields are read. */
  sounds: SoundWave[];
  /** Longest time any recorded ring takes to reach full size (s). */
  longestSound: number;
  marks: ReplayMark[];
  cores: ReplayThing[];
  pickups: ReplayPickup[];
  emitters: ReplayEmitter[];
  beacon: Vec2 & { activeAt: number | null };
  /** How the round ended for the recorded player (`playerId`). */
  outcome: Exclude<RoundStatus, 'playing'> | null;
  /** Duels only. */
  duel: ReplayDuel | null;
}

/** Last sample time: how long the replay lasts. */
export function replayDuration(replay: Replay): number {
  return replay.times[replay.times.length - 1] ?? 0;
}

/** Sample index `i` and fraction `f` (0..1) toward sample i + 1, for time `t`. */
export interface SamplePoint {
  i: number;
  f: number;
}

export function samplePointAt(replay: Replay, t: number): SamplePoint {
  const { times } = replay;
  const last = times.length - 1;
  if (last <= 0 || t <= times[0]) return { i: 0, f: 0 };
  if (t >= times[last]) return { i: last, f: 0 };
  // Largest i with times[i] <= t.
  let lo = 0;
  let hi = last;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (times[mid] <= t) lo = mid;
    else hi = mid;
  }
  return { i: lo, f: (t - times[lo]) / (times[lo + 1] - times[lo]) };
}

/** Interpolated position on a track. */
export function trackPosition(track: ReplayTrack, { i, f }: SamplePoint): Vec2 {
  const x0 = track.xy[i * 2];
  const y0 = track.xy[i * 2 + 1];
  if (f === 0 || i * 2 + 3 >= track.xy.length) return { x: x0, y: y0 };
  return {
    x: x0 + (track.xy[i * 2 + 2] - x0) * f,
    y: y0 + (track.xy[i * 2 + 3] - y0) * f,
  };
}

/** Rings still growing at time `t`, sized for that moment (copies; the recording is untouched). */
export function soundsAt(replay: Replay, t: number): SoundWave[] {
  const { sounds } = replay;
  // First sound that could still be growing: binary search on start time.
  const from = t - replay.longestSound;
  let lo = 0;
  let hi = sounds.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sounds[mid].startTime < from) lo = mid + 1;
    else hi = mid;
  }
  const active: SoundWave[] = [];
  for (let k = lo; k < sounds.length && sounds[k].startTime <= t; k++) {
    const w = sounds[k];
    const radius = w.speed * (t - w.startTime);
    if (radius < w.maxRadius) active.push({ ...w, radius });
  }
  return active;
}

/** Was this vent or pipe making noise (covering footsteps) at time `t`? */
export function emitterActiveAt(emitter: ReplayEmitter, t: number): boolean {
  const { spells } = emitter;
  // Last spell that started at or before t.
  let lo = 0;
  let hi = spells.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (spells[mid] <= t) lo = mid + 1;
    else hi = mid;
  }
  return lo > 0 && t - spells[lo - 1] < EMITTER_TYPES[emitter.type].activeTime;
}

/** Was the thing there at time `t` (already there, and not taken yet)? */
export function presentAt(thing: Pick<ReplayThing, 'takenAt' | 'appearedAt'>, t: number): boolean {
  return (thing.appearedAt ?? 0) <= t && (thing.takenAt === null || thing.takenAt > t);
}

/** The players' paths as `viewerId` sees them: their own, and (duels) the rival's. */
export function viewedTracks(
  replay: Replay,
  viewerId = replay.playerId,
): { mine: ReplayTrack; rival: ReplayTrack | null } {
  const { duel } = replay;
  if (!duel) return { mine: replay.player, rival: null };
  return viewerId === duel.rivalId
    ? { mine: duel.rival, rival: replay.player }
    : { mine: replay.player, rival: duel.rival };
}

/** How the round ended for `viewerId`. */
export function outcomeFor(replay: Replay, viewerId = replay.playerId): Replay['outcome'] {
  const { duel } = replay;
  if (!duel || viewerId === replay.playerId) return replay.outcome;
  if (duel.winner === null) return null;
  return duel.winner === viewerId ? 'extracted' : 'lost';
}
