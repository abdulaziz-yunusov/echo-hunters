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
