import { describe, expect, it } from 'vitest';
import type { Bounds } from '@/core/geometry';
import { SpatialGrid } from '@/core/spatialGrid';

const box = (minX: number, minY: number, maxX: number, maxY: number): Bounds => ({
  minX,
  minY,
  maxX,
  maxY,
});

describe('SpatialGrid', () => {
  const items = [
    box(10, 10, 20, 20), // 0: cell (0,0)
    box(150, 150, 160, 160), // 1: cell (1,1)
    box(90, 10, 250, 20), // 2: spans cells (0,0)…(2,0)
    box(390, 390, 399, 399), // 3: last cell
  ];
  const grid = new SpatialGrid(100, 400, 400, items);

  const sorted = (ids: number[]) => [...ids].sort((a, b) => a - b);

  it('finds items in overlapping cells', () => {
    expect(sorted(grid.query(box(0, 0, 50, 50)))).toEqual([0, 2]);
    expect(sorted(grid.query(box(120, 120, 180, 180)))).toEqual([1]);
  });

  it('returns an item spanning many cells only once', () => {
    const ids = grid.query(box(0, 0, 399, 50));
    expect(ids.filter((id) => id === 2)).toHaveLength(1);
  });

  it('clamps queries outside the grid', () => {
    expect(sorted(grid.query(box(-500, -500, -10, -10)))).toEqual([0, 2]);
    expect(grid.query(box(1000, 1000, 2000, 2000))).toEqual([3]);
  });

  it('queryCircle covers the circle bounds', () => {
    expect(sorted(grid.queryCircle(155, 155, 5))).toEqual([1]);
  });

  it('repeated queries stay correct', () => {
    for (let i = 0; i < 5; i++) expect(sorted(grid.query(box(0, 0, 50, 50)))).toEqual([0, 2]);
  });
});
