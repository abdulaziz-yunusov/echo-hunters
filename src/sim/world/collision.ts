import type { TileMap } from './tileMap';

export interface MoveResult {
  x: number;
  y: number;
  /** True if a wall pushed the circle during this move. */
  hit: boolean;
  /** Unit direction walls pushed the circle (away from the walls); 0,0 if no hit. */
  nx: number;
  ny: number;
}

/** Contacts resolved per position (one per pass); an inside corner needs two. */
const PASSES = 4;

/**
 * Move a circle by (dx, dy), sliding along walls. Long moves are split into
 * sub-steps no longer than half the radius, so nothing tunnels through a tile.
 */
export function moveCircle(
  map: TileMap,
  x: number,
  y: number,
  radius: number,
  dx: number,
  dy: number,
): MoveResult {
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / (radius * 0.5)));
  const result: MoveResult = { x, y, hit: false, nx: 0, ny: 0 };
  let sumX = 0;
  let sumY = 0;

  for (let i = 0; i < steps; i++) {
    const r = resolveCircle(map, result.x + dx / steps, result.y + dy / steps, radius);
    result.x = r.x;
    result.y = r.y;
    if (r.hit) {
      result.hit = true;
      sumX += r.nx;
      sumY += r.ny;
    }
  }

  const length = Math.hypot(sumX, sumY);
  if (length > 0) {
    result.nx = sumX / length;
    result.ny = sumY / length;
  }
  return result;
}

interface Contact {
  px: number;
  py: number;
  depth: number;
}

/**
 * Push a circle out of the wall tiles it overlaps, one contact per pass,
 * deepest first. Deepest-first matters: along a flat wall made of several
 * tiles, the face of the tile under the circle is always deeper than the
 * corner of its neighbour, so the circle slides straight instead of being
 * nudged sideways by the seam between tiles.
 */
export function resolveCircle(map: TileMap, x: number, y: number, radius: number): MoveResult {
  let hit = false;
  let sumX = 0;
  let sumY = 0;

  for (let pass = 0; pass < PASSES; pass++) {
    const c = deepestContact(map, x, y, radius);
    if (!c) break;
    x += c.px * c.depth;
    y += c.py * c.depth;
    sumX += c.px;
    sumY += c.py;
    hit = true;
  }

  const length = Math.hypot(sumX, sumY);
  return {
    x,
    y,
    hit,
    nx: length > 0 ? sumX / length : 0,
    ny: length > 0 ? sumY / length : 0,
  };
}

function deepestContact(map: TileMap, x: number, y: number, radius: number): Contact | null {
  const ts = map.tileSize;
  const r2 = radius * radius;
  let best: Contact | null = null;

  for (let ty = Math.floor((y - radius) / ts); ty <= Math.floor((y + radius) / ts); ty++) {
    for (let tx = Math.floor((x - radius) / ts); tx <= Math.floor((x + radius) / ts); tx++) {
      if (!map.isWall(tx, ty)) continue;
      const left = tx * ts;
      const top = ty * ts;
      // Closest point of the tile to the circle center.
      const ddx = x - Math.min(Math.max(x, left), left + ts);
      const ddy = y - Math.min(Math.max(y, top), top + ts);
      const d2 = ddx * ddx + ddy * ddy;
      if (d2 >= r2) continue;

      let contact: Contact;
      if (d2 > 1e-12) {
        const d = Math.sqrt(d2);
        contact = { px: ddx / d, py: ddy / d, depth: radius - d };
      } else {
        // Center inside the tile (should not happen in play): leave by the nearest side.
        const exits: [number, number, number][] = [
          [-1, 0, x - left],
          [1, 0, left + ts - x],
          [0, -1, y - top],
          [0, 1, top + ts - y],
        ];
        exits.sort((a, b) => a[2] - b[2]);
        const [px, py, distance] = exits[0];
        contact = { px, py, depth: distance + radius };
      }
      if (!best || contact.depth > best.depth) best = contact;
    }
  }
  return best;
}
