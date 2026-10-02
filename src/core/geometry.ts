/** A point or direction in world pixels. */
export interface Vec2 {
  x: number;
  y: number;
}

/** Axis-aligned rectangle; units depend on use (tiles or pixels). */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Inclusive axis-aligned bounds. */
export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** Line segment from A to B. */
export interface Segment {
  ax: number;
  ay: number;
  bx: number;
  by: number;
}

export function segmentBounds(s: Segment): Bounds {
  return {
    minX: Math.min(s.ax, s.bx),
    minY: Math.min(s.ay, s.by),
    maxX: Math.max(s.ax, s.bx),
    maxY: Math.max(s.ay, s.by),
  };
}

export function segmentLength(s: Segment): number {
  return Math.hypot(s.bx - s.ax, s.by - s.ay);
}

/** Shortest distance from a point to a segment. */
export function pointSegmentDistance(px: number, py: number, s: Segment): number {
  const sx = s.bx - s.ax;
  const sy = s.by - s.ay;
  const len2 = sx * sx + sy * sy;
  const t = len2 > 0 ? Math.min(1, Math.max(0, ((px - s.ax) * sx + (py - s.ay) * sy) / len2)) : 0;
  return Math.hypot(px - (s.ax + sx * t), py - (s.ay + sy * t));
}

/**
 * Where a ray from (x, y) along (dx, dy) crosses a segment, as a multiple
 * of (dx, dy); -1 if it misses. Parallel segments count as a miss.
 */
export function raySegment(x: number, y: number, dx: number, dy: number, s: Segment): number {
  const sx = s.bx - s.ax;
  const sy = s.by - s.ay;
  const denom = dx * sy - dy * sx;
  if (Math.abs(denom) < 1e-12) return -1;
  const qx = s.ax - x;
  const qy = s.ay - y;
  const t = (qx * sy - qy * sx) / denom;
  const u = (qx * dy - qy * dx) / denom;
  return t >= 0 && u >= 0 && u <= 1 ? t : -1;
}

/** Even-odd test against a polygon stored as x0, y0, x1, y1, … */
export function pointInPolygon(px: number, py: number, points: ArrayLike<number>): boolean {
  let inside = false;
  for (let i = 0, j = points.length - 2; i < points.length; j = i, i += 2) {
    const xi = points[i];
    const yi = points[i + 1];
    const xj = points[j];
    const yj = points[j + 1];
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** A wedge of directions: everything within `halfAngle` of `dir` (radians). */
export interface Sector {
  dir: number;
  halfAngle: number;
}

/** Signed angle from `from` to `to`, in (-π, π]. */
export function angleBetween(from: number, to: number): number {
  const d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) return d - Math.PI * 2;
  return d <= -Math.PI ? d + Math.PI * 2 : d;
}

/** True if the direction (dx, dy) lies inside the sector (a zero vector does). */
export function inSector(sector: Sector, dx: number, dy: number): boolean {
  if (dx === 0 && dy === 0) return true;
  return Math.abs(angleBetween(sector.dir, Math.atan2(dy, dx))) <= sector.halfAngle;
}
