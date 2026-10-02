import {
  angleBetween,
  pointSegmentDistance,
  raySegment,
  type Bounds,
  type Sector,
} from '@/core/geometry';
import type { WallGeometry, WallSegment } from './edges';

/** Evenly spaced extra rays so open areas get a round edge, not a polygon of chords. */
const CIRCLE_RAYS = 64;
/** Angle offset for the rays that slip past wall corners (radians). */
const CORNER_EPSILON = 1e-4;

/**
 * Everything visible from (x, y) within `radius`, with walls blocking the
 * view. The result is a polygon (x0, y0, x1, y1, …, sorted by angle) that
 * sound rings are clipped to, which creates the echo shadows.
 *
 * With a `sector`, only that wedge is cast and the polygon starts at the
 * origin (a directional sound, Phase 18). A narrow wedge casts fewer rays.
 *
 * Exact: rays are cast at every wall endpoint (and just either side of it),
 * so no wall is ever skipped however thin or far away.
 * The origin must be in open floor, not exactly on a wall face.
 */
export function visibilityPolygon(
  walls: WallGeometry,
  x: number,
  y: number,
  radius: number,
  sector: Sector | null = null,
): Float32Array {
  const segments = facingSegments(walls, x, y, radius, sector);
  // Ray angles are relative to `base`; a full circle is half-angle π around 0.
  const base = sector?.dir ?? 0;
  const half = sector?.halfAngle ?? Math.PI;

  const angles: number[] = [];
  if (sector) {
    // Both edges of the wedge, and evenly spaced rays between them.
    const n = Math.max(1, Math.ceil((CIRCLE_RAYS * half) / Math.PI));
    for (let k = 0; k <= n; k++) angles.push(-half + (2 * half * k) / n);
  } else {
    for (let k = 0; k < CIRCLE_RAYS; k++) angles.push((k / CIRCLE_RAYS) * Math.PI * 2 - Math.PI);
  }
  // One pair of rays per corner (neighbouring walls share their endpoints),
  // just either side of it: one stops at the wall, the other slips past.
  const corners = new Set<number>();
  for (const s of segments) {
    for (const [px, py] of [
      [s.ax, s.ay],
      [s.bx, s.by],
    ]) {
      const key = px * 1_000_003 + py;
      if (corners.has(key) || Math.hypot(px - x, py - y) > radius + 1) continue;
      corners.add(key);
      const a = angleBetween(base, Math.atan2(py - y, px - x));
      for (const r of [a - CORNER_EPSILON, a + CORNER_EPSILON]) {
        if (!sector || Math.abs(r) <= half) angles.push(r);
      }
    }
  }
  angles.sort((a, b) => a - b);

  // A wedge's outline runs from the origin out along one edge and back along the other.
  const first = sector ? 1 : 0;
  const points = new Float32Array((first + angles.length) * 2);
  points[0] = x;
  points[1] = y;
  angles.forEach((angle, i) => {
    const dx = Math.cos(base + angle);
    const dy = Math.sin(base + angle);
    let nearest = radius;
    for (const s of segments) {
      const t = raySegment(x, y, dx, dy, s);
      if (t >= 0 && t < nearest) nearest = t;
    }
    const at = (first + i) * 2;
    points[at] = x + dx * nearest;
    points[at + 1] = y + dy * nearest;
  });
  return points;
}

/** True if nothing blocks the straight line between two points (the end point itself excluded). */
export function hasLineOfSight(
  walls: WallGeometry,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): boolean {
  const ids = walls.segmentGrid.query({
    minX: Math.min(x0, x1),
    minY: Math.min(y0, y1),
    maxX: Math.max(x0, x1),
    maxY: Math.max(y0, y1),
  });
  const dx = x1 - x0;
  const dy = y1 - y0;
  for (const id of ids) {
    const t = raySegment(x0, y0, dx, dy, walls.segments[id]);
    if (t >= 0 && t < 1 - 1e-9) return false;
  }
  return true;
}

/**
 * Wall faces within reach that turn toward the point. A ray from open floor
 * always enters a wall through such a face first, so the others (about
 * half) can never be the nearest hit and are skipped. A wedge only looks
 * in the grid cells under its bounding box.
 */
function facingSegments(
  walls: WallGeometry,
  x: number,
  y: number,
  radius: number,
  sector: Sector | null,
): WallSegment[] {
  const ids = sector
    ? walls.segmentGrid.query(sectorBounds(x, y, radius, sector))
    : walls.segmentGrid.queryCircle(x, y, radius);
  const result: WallSegment[] = [];
  for (const id of ids) {
    const s = walls.segments[id];
    if ((x - s.ax) * s.nx + (y - s.ay) * s.ny <= 0) continue;
    if (pointSegmentDistance(x, y, s) > radius) continue;
    result.push(s);
  }
  return result;
}

/** Bounding box of a wedge: its origin, its two outer corners and any axis it sweeps across. */
function sectorBounds(x: number, y: number, radius: number, sector: Sector): Bounds {
  const b: Bounds = { minX: x, minY: y, maxX: x, maxY: y };
  const add = (angle: number): void => {
    const px = x + Math.cos(angle) * radius;
    const py = y + Math.sin(angle) * radius;
    b.minX = Math.min(b.minX, px);
    b.minY = Math.min(b.minY, py);
    b.maxX = Math.max(b.maxX, px);
    b.maxY = Math.max(b.maxY, py);
  };
  add(sector.dir - sector.halfAngle);
  add(sector.dir + sector.halfAngle);
  for (let k = 0; k < 4; k++) {
    const axis = (k * Math.PI) / 2;
    if (Math.abs(angleBetween(sector.dir, axis)) <= sector.halfAngle) add(axis);
  }
  return b;
}
