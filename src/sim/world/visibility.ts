import { pointSegmentDistance, raySegment } from '@/core/geometry';
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
 * Exact: rays are cast at every wall endpoint (and just either side of it),
 * so no wall is ever skipped however thin or far away.
 * The origin must be in open floor, not exactly on a wall face.
 */
export function visibilityPolygon(
  walls: WallGeometry,
  x: number,
  y: number,
  radius: number,
): Float32Array {
  const segments = facingSegments(walls, x, y, radius);

  const angles: number[] = [];
  for (let k = 0; k < CIRCLE_RAYS; k++) angles.push((k / CIRCLE_RAYS) * Math.PI * 2 - Math.PI);
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
      const a = Math.atan2(py - y, px - x);
      angles.push(a - CORNER_EPSILON, a + CORNER_EPSILON);
    }
  }
  angles.sort((a, b) => a - b);

  const points = new Float32Array(angles.length * 2);
  angles.forEach((angle, i) => {
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    let nearest = radius;
    for (const s of segments) {
      const t = raySegment(x, y, dx, dy, s);
      if (t >= 0 && t < nearest) nearest = t;
    }
    points[i * 2] = x + dx * nearest;
    points[i * 2 + 1] = y + dy * nearest;
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
 * half) can never be the nearest hit and are skipped.
 */
function facingSegments(walls: WallGeometry, x: number, y: number, radius: number): WallSegment[] {
  const result: WallSegment[] = [];
  for (const id of walls.segmentGrid.queryCircle(x, y, radius)) {
    const s = walls.segments[id];
    if ((x - s.ax) * s.nx + (y - s.ay) * s.ny <= 0) continue;
    if (pointSegmentDistance(x, y, s) > radius) continue;
    result.push(s);
  }
  return result;
}
