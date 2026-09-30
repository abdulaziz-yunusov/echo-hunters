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

export type ReplayMarkKind = 'core' | 'pickup' | 'beacon' | 'hit' | 'stun' | 'close' | 'end';

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
}

export interface ReplayPickup extends ReplayThing {
  type: PickupTypeId;
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
  beacon: Vec2 & { activeAt: number | null };
  outcome: Exclude<RoundStatus, 'playing'> | null;
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

/** Was the thing still there at time `t`? */
export function presentAt(thing: { takenAt: number | null }, t: number): boolean {
  return thing.takenAt === null || thing.takenAt > t;
}
