/** Shoelace area of a polygon stored as x0, y0, x1, y1, … */
export function polygonArea(p: ArrayLike<number>): number {
  let sum = 0;
  for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) {
    sum += p[j] * p[i + 1] - p[i] * p[j + 1];
  }
  return Math.abs(sum) / 2;
}
