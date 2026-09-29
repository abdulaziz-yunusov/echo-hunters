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
