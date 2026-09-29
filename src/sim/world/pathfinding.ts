import type { Vec2 } from '@/core/geometry';
import { MinHeap } from '@/core/heap';
import { DIRS4, type TileCoord, type TileMap } from './tileMap';

/** Distance-field value for walls and tiles that cannot be reached. */
export const UNREACHABLE = -1;

/**
 * Breadth-first distance, in 4-neighbour tile steps, from the nearest start
 * tile to every tile (index = ty * width + tx). Used for spawn/beacon
 * placement now, and path-based hearing and AI later.
 */
export function distanceField(map: TileMap, starts: readonly TileCoord[]): Int32Array {
  const { width, height } = map;
  const dist = new Int32Array(width * height).fill(UNREACHABLE);
  const queue = new Int32Array(width * height);
  let head = 0;
  let tail = 0;

  for (const s of starts) {
    const i = map.index(s.tx, s.ty);
    if (map.isFloor(s.tx, s.ty) && dist[i] === UNREACHABLE) {
      dist[i] = 0;
      queue[tail++] = i;
    }
  }

  while (head < tail) {
    const i = queue[head++];
    const tx = i % width;
    const ty = (i - tx) / width;
    for (const [dx, dy] of DIRS4) {
      const nx = tx + dx;
      const ny = ty + dy;
      if (!map.isFloor(nx, ny)) continue;
      const n = ny * width + nx;
      if (dist[n] !== UNREACHABLE) continue;
      dist[n] = dist[i] + 1;
      queue[tail++] = n;
    }
  }
  return dist;
}

/**
 * Shortest 4-neighbour path between two floor tiles (A*, Manhattan
 * heuristic). Returns the tiles after `from` up to and including `to`
 * ([] if already there), or null if `to` cannot be reached.
 */
export function findPath(map: TileMap, from: TileCoord, to: TileCoord): TileCoord[] | null {
  if (!map.isFloor(from.tx, from.ty) || !map.isFloor(to.tx, to.ty)) return null;
  const start = map.index(from.tx, from.ty);
  const goal = map.index(to.tx, to.ty);
  if (start === goal) return [];

  const cost = new Int32Array(map.width * map.height).fill(-1);
  const cameFrom = new Int32Array(map.width * map.height).fill(-1);
  const open = new MinHeap<number>();
  cost[start] = 0;
  open.push(start, 0);

  while (open.size > 0) {
    const current = open.pop()!;
    if (current === goal) break;
    const tx = current % map.width;
    const ty = (current - tx) / map.width;
    for (const [dx, dy] of DIRS4) {
      const nx = tx + dx;
      const ny = ty + dy;
      if (!map.isFloor(nx, ny)) continue;
      const next = ny * map.width + nx;
      const nextCost = cost[current] + 1;
      if (cost[next] !== -1 && cost[next] <= nextCost) continue;
      cost[next] = nextCost;
      cameFrom[next] = current;
      open.push(next, nextCost + Math.abs(to.tx - nx) + Math.abs(to.ty - ny));
    }
  }

  if (cost[goal] === -1) return null;
  const path: TileCoord[] = [];
  for (let i = goal; i !== start; i = cameFrom[i]) path.push(map.coordOf(i));
  return path.reverse();
}

/**
 * True if a circle of `radius` can travel in a straight line from a to b
 * without touching a wall (sampled every quarter tile).
 */
export function lineWalkable(map: TileMap, a: Vec2, b: Vec2, radius: number): boolean {
  const length = Math.hypot(b.x - a.x, b.y - a.y);
  const steps = Math.max(1, Math.ceil(length / (map.tileSize / 4)));
  const ts = map.tileSize;
  for (let i = 0; i <= steps; i++) {
    const x = a.x + ((b.x - a.x) * i) / steps;
    const y = a.y + ((b.y - a.y) * i) / steps;
    for (let ty = Math.floor((y - radius) / ts); ty <= Math.floor((y + radius) / ts); ty++) {
      for (let tx = Math.floor((x - radius) / ts); tx <= Math.floor((x + radius) / ts); tx++) {
        if (!map.isWall(tx, ty)) continue;
        const cx = Math.min(Math.max(x, tx * ts), (tx + 1) * ts);
        const cy = Math.min(Math.max(y, ty * ts), (ty + 1) * ts);
        if (Math.hypot(x - cx, y - cy) < radius) return false;
      }
    }
  }
  return true;
}

/**
 * Drop waypoints that can be skipped with a straight, wall-free walk, so
 * movers cut corners naturally instead of zig-zagging tile by tile.
 */
export function smoothPath(
  map: TileMap,
  start: Vec2,
  points: readonly Vec2[],
  radius: number,
): Vec2[] {
  const result: Vec2[] = [];
  let from = start;
  let i = 0;
  while (i < points.length) {
    let far = i;
    while (far + 1 < points.length && lineWalkable(map, from, points[far + 1], radius)) far++;
    result.push(points[far]);
    from = points[far];
    i = far + 1;
  }
  return result;
}
