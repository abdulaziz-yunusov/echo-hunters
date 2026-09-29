/** Pure mixing math, kept apart from Web Audio so it can be tested. */

/** Stereo position: -1 fully left, 0 center, 1 fully right. */
export function stereoPan(dx: number, panRange: number): number {
  return Math.max(-1, Math.min(1, dx / panRange));
}

/** Volume from distance: 1 at the source, falling smoothly to 0 at `range`. */
export function distanceGain(distance: number, range: number): number {
  if (distance >= range) return 0;
  return (1 - distance / range) ** 1.5;
}

/** How close the nearest hunter is, as 0 (out of range / none) to 1 (on top of you). */
export function proximity(nearest: number | null, range: number): number {
  if (nearest === null || nearest >= range) return 0;
  return 1 - nearest / range;
}
