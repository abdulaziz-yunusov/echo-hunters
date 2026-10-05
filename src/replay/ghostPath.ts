import { GHOST } from '@/config/ghost';
import type { Vec2 } from '@/core/geometry';
import { replayDuration, samplePointAt, trackPosition, type Replay } from './replay';

/**
 * A best run's path (Phase 23): positions only, never inputs, so it still
 * plays back after the game's numbers are tuned.
 *
 * Text format: `<unit>:<x0>,<y0>:<steps>` with positions in `unit` px.
 * Each step is dx then dy, one character each for -32..31 units (a 10 Hz
 * walk is a few units), or `!<n>!` for anything bigger (a debug warp).
 */
const DIGITS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const SMALL = 32;

export function encodePath(points: readonly Vec2[], unit: number = GHOST.unit): string {
  if (points.length === 0) return '';
  const q = (v: number) => Math.round(v / unit);
  let x = q(points[0].x);
  let y = q(points[0].y);
  let steps = '';
  const step = (d: number) => (d >= -SMALL && d < SMALL ? DIGITS[d + SMALL] : `!${d}!`);
  for (let i = 1; i < points.length; i++) {
    const nx = q(points[i].x);
    const ny = q(points[i].y);
    steps += step(nx - x) + step(ny - y);
    x = nx;
    y = ny;
  }
  return `${unit}:${q(points[0].x)},${q(points[0].y)}:${steps}`;
}

/** The points of an encoded path, or null if the text is not a valid path. */
export function decodePath(text: string): Vec2[] | null {
  const m = /^(\d+):(-?\d+),(-?\d+):([A-Za-z0-9_!-]*)$/.exec(text);
  if (!m) return null;
  const unit = Number(m[1]);
  if (unit <= 0) return null;
  let x = Number(m[2]);
  let y = Number(m[3]);
  const points: Vec2[] = [{ x: x * unit, y: y * unit }];
  const steps = m[4];
  const deltas: number[] = [];
  for (let i = 0; i < steps.length;) {
    if (steps[i] === '!') {
      const end = steps.indexOf('!', i + 1);
      const n = Number(steps.slice(i + 1, end));
      if (end < 0 || !Number.isInteger(n)) return null;
      deltas.push(n);
      i = end + 1;
    } else {
      const d = DIGITS.indexOf(steps[i]);
      if (d < 0) return null;
      deltas.push(d - SMALL);
      i++;
    }
  }
  if (deltas.length % 2 !== 0) return null;
  for (let i = 0; i < deltas.length; i += 2) {
    x += deltas[i];
    y += deltas[i + 1];
    points.push({ x: x * unit, y: y * unit });
  }
  return points;
}

/** The recorded player's path through a round, resampled at `hz`. */
export function pathFromReplay(replay: Replay, hz: number = GHOST.sampleHz): Vec2[] {
  const end = replayDuration(replay);
  const points: Vec2[] = [];
  for (let k = 0; k / hz <= end; k++) {
    points.push(trackPosition(replay.player, samplePointAt(replay, k / hz)));
  }
  return points;
}

/** A path played back over time: where the ghost is at `t` (null once it has left). */
export class GhostTrack {
  readonly points: readonly Vec2[];
  private readonly hz: number;

  constructor(points: readonly Vec2[], hz: number = GHOST.sampleHz) {
    this.points = points;
    this.hz = hz;
  }

  /** The run's length (s): after this the ghost has extracted and is gone. */
  get duration(): number {
    return Math.max(0, this.points.length - 1) / this.hz;
  }

  positionAt(t: number): Vec2 | null {
    if (this.points.length === 0 || t < 0 || t > this.duration) return null;
    const at = t * this.hz;
    const i = Math.min(Math.floor(at), this.points.length - 1);
    const a = this.points[i];
    const b = this.points[Math.min(i + 1, this.points.length - 1)];
    const f = at - i;
    return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
  }
}
