import { describe, expect, it } from 'vitest';
import { segmentLength } from '@/core/geometry';
import { buildWallGeometry } from '@/sim/world/edges';
import { generateMap, mapOptionsFromConfig } from '@/sim/world/mapGen';
import { fromAscii, TS } from '../../helpers/maps';

describe('buildWallGeometry', () => {
  it('a single floor tile has 4 edges facing it', () => {
    const g = buildWallGeometry(fromAscii(['###', '#.#', '###']));
    expect(g.edges).toHaveLength(4);
    expect(g.segments).toHaveLength(4);
    for (const e of g.edges) expect(segmentLength(e)).toBe(TS);
    // Normals point into the floor tile at (1,1): from each edge, one step along the normal lands in it.
    for (const e of g.edges) {
      const mx = (e.ax + e.bx) / 2 + e.nx * (TS / 2);
      const my = (e.ay + e.by) / 2 + e.ny * (TS / 2);
      expect([Math.floor(mx / TS), Math.floor(my / TS)]).toEqual([1, 1]);
    }
  });

  it('merges a straight corridor wall into one segment', () => {
    const g = buildWallGeometry(fromAscii(['#####', '#...#', '#####']));
    // 3 top + 3 bottom + 1 left + 1 right tile edges.
    expect(g.edges).toHaveLength(8);
    // top, bottom, left end, right end.
    expect(g.segments).toHaveLength(4);
    const top = g.segments.find((s) => s.ny === 1 && s.ay === TS)!;
    expect(top).toMatchObject({ ax: TS, bx: 4 * TS, edgeCount: 3 });
  });

  it('keeps both faces of a thin wall between two floors', () => {
    const g = buildWallGeometry(fromAscii(['#####', '#.#.#', '#####']));
    const middleFaces = g.edges.filter(
      (e) => e.ax === e.bx && (e.ax === 2 * TS || e.ax === 3 * TS),
    );
    expect(middleFaces).toHaveLength(2);
  });

  it('on a generated map, every segment covers exactly its own collinear edges', () => {
    const { tiles } = generateMap(mapOptionsFromConfig(2024));
    const g = buildWallGeometry(tiles);
    let covered = 0;
    for (const s of g.segments) {
      const run = g.edges.slice(s.firstEdge, s.firstEdge + s.edgeCount);
      const total = run.reduce((sum, e) => sum + segmentLength(e), 0);
      expect(total).toBeCloseTo(segmentLength(s));
      for (const e of run) expect([e.nx, e.ny]).toEqual([s.nx, s.ny]);
      covered += s.edgeCount;
    }
    expect(covered).toBe(g.edges.length);
    expect(g.segments.length).toBeLessThan(g.edges.length);
  });

  it('every edge separates a wall tile from a floor tile', () => {
    const { tiles } = generateMap(mapOptionsFromConfig(99));
    for (const e of buildWallGeometry(tiles).edges) {
      const mx = (e.ax + e.bx) / 2;
      const my = (e.ay + e.by) / 2;
      const floor = [Math.floor((mx + e.nx) / TS), Math.floor((my + e.ny) / TS)] as const;
      const wall = [Math.floor((mx - e.nx) / TS), Math.floor((my - e.ny) / TS)] as const;
      expect(tiles.isFloor(...floor)).toBe(true);
      expect(tiles.isWall(...wall)).toBe(true);
    }
  });

  it('indexes segments spatially', () => {
    const { tiles } = generateMap(mapOptionsFromConfig(5));
    const g = buildWallGeometry(tiles);
    const near = g.segmentGrid.queryCircle(tiles.worldWidth / 2, tiles.worldHeight / 2, 64);
    expect(near.length).toBeGreaterThan(0);
    expect(near.length).toBeLessThan(g.segments.length);
  });
});
