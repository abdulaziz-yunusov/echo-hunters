import { HUNTER_COMMON } from '@/config/hunters';
import type { Vec2 } from '@/core/geometry';
import type { Hunter } from '../entities/hunter';
import { moveCircle } from '../world/collision';
import { findPath, smoothPath } from '../world/pathfinding';
import type { HunterContext } from './hunterContext';

/** A waypoint counts as reached this close (px). */
const ARRIVE = 3;
/** Less progress than this share of the intended step counts as not moving. */
const STUCK_PROGRESS = 0.25;

export type Travel = 'moving' | 'arrived' | 'stuck';

/**
 * Plan a walk to `point` (A* over tiles, then smoothed). Aims for the center
 * of the point's tile: a sound 1 px from a wall is not reachable exactly.
 * Returns false if there is no way there.
 */
export function setGoal(c: HunterContext, point: Vec2): boolean {
  const h = c.hunter;
  const tiles = c.sim.state.layout.tiles;
  const target = { tx: tiles.toTile(point.x), ty: tiles.toTile(point.y) };
  const route = findPath(tiles, { tx: tiles.toTile(h.x), ty: tiles.toTile(h.y) }, target);
  if (!route) {
    stop(h);
    return false;
  }
  const points = route.length > 0 ? route.map((t) => tiles.center(t)) : [tiles.center(target)];
  h.path = smoothPath(tiles, h, points, h.radius + 1);
  h.goal = tiles.center(target);
  h.stuckTime = 0;
  return true;
}

export function stop(h: Hunter): void {
  h.goal = null;
  h.path = [];
  h.stuckTime = 0;
}

/** Walk along the planned path at `speed`, leaving footsteps. */
export function followPath(c: HunterContext, speed: number, dt: number): Travel {
  const h = c.hunter;
  if (!h.goal) return 'arrived';
  while (h.path.length > 0 && Math.hypot(h.path[0].x - h.x, h.path[0].y - h.y) < ARRIVE) {
    h.path.shift();
  }
  if (h.path.length === 0) {
    stop(h);
    return 'arrived';
  }

  const wp = h.path[0];
  const dx = wp.x - h.x;
  const dy = wp.y - h.y;
  const distance = Math.hypot(dx, dy);
  const step = Math.min(speed * dt, distance);
  const moved = moveCircle(
    c.sim.state.layout.tiles,
    h.x,
    h.y,
    h.radius,
    (dx / distance) * step,
    (dy / distance) * step,
  );
  const progress = Math.hypot(moved.x - h.x, moved.y - h.y);
  h.x = moved.x;
  h.y = moved.y;
  h.facing = Math.atan2(dy, dx);

  leaveFootsteps(c, progress);

  if (progress < speed * dt * STUCK_PROGRESS) h.stuckTime += dt;
  else h.stuckTime = 0;
  if (h.stuckTime > HUNTER_COMMON.stuckTimeout) {
    stop(h);
    return 'stuck';
  }
  return 'moving';
}

/** A random floor spot (tile center) within `radius` of `center`, or null if there is none. */
export function randomPointNear(c: HunterContext, center: Vec2, radius: number): Vec2 | null {
  const tiles = c.sim.state.layout.tiles;
  const ts = tiles.tileSize;
  const options: Vec2[] = [];
  const r = Math.ceil(radius / ts);
  const cx = tiles.toTile(center.x);
  const cy = tiles.toTile(center.y);
  for (let ty = cy - r; ty <= cy + r; ty++) {
    for (let tx = cx - r; tx <= cx + r; tx++) {
      if (!tiles.isFloor(tx, ty)) continue;
      const p = tiles.center({ tx, ty });
      if (Math.hypot(p.x - center.x, p.y - center.y) <= radius) options.push(p);
    }
  }
  return options.length > 0 ? c.sim.state.rng.pick(options) : null;
}

/** Footsteps by distance walked (like the player's), so slow strolls are quieter. */
function leaveFootsteps(c: HunterContext, distance: number): void {
  const { hunter: h, def } = c;
  if (def.footstepInterval <= 0) return;
  h.stride += distance;
  const strideLength = def.speed * def.footstepInterval;
  while (h.stride >= strideLength) {
    h.stride -= strideLength;
    c.sim.emitSound('hunterStep', h.x, h.y, h.id);
  }
}
