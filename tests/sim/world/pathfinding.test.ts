import { describe, expect, it } from 'vitest';
import { Rng } from '@/core/rng';
import { generateMap, mapOptionsFromConfig } from '@/sim/world/mapGen';
import {
  distanceField,
  findPath,
  lineWalkable,
  smoothPath,
  UNREACHABLE,
} from '@/sim/world/pathfinding';
import type { TileCoord } from '@/sim/world/tileMap';
import { fromAscii } from '../../helpers/maps';

describe('distanceField', () => {
  const map = fromAscii([
    '#######', //
    '#...#.#',
    '#.#.#.#',
    '#.#...#',
    '#######',
  ]);
  const d = (f: Int32Array, tx: number, ty: number) => f[map.index(tx, ty)];

  it('counts 4-neighbour steps around walls', () => {
    const f = distanceField(map, [{ tx: 1, ty: 1 }]);
    expect(d(f, 1, 1)).toBe(0);
    expect(d(f, 3, 1)).toBe(2);
    expect(d(f, 5, 1)).toBe(8); // right, down, across the bottom, back up
  });

  it('marks walls unreachable', () => {
    const f = distanceField(map, [{ tx: 1, ty: 1 }]);
    expect(d(f, 0, 0)).toBe(UNREACHABLE);
    expect(d(f, 2, 2)).toBe(UNREACHABLE);
  });

  it('uses the nearest of several starts', () => {
    const f = distanceField(map, [
      { tx: 1, ty: 1 },
      { tx: 5, ty: 1 },
    ]);
    expect(d(f, 5, 3)).toBe(2);
    expect(d(f, 1, 3)).toBe(2);
  });

  it('ignores starts on walls', () => {
    const f = distanceField(map, [{ tx: 0, ty: 0 }]);
    expect([...f].every((v) => v === UNREACHABLE)).toBe(true);
  });
});

describe('findPath (A*)', () => {
  const layout = generateMap(mapOptionsFromConfig(11));
  const { tiles } = layout;
  const floor: TileCoord[] = [];
  for (let ty = 0; ty < tiles.height; ty++) {
    for (let tx = 0; tx < tiles.width; tx++) if (tiles.isFloor(tx, ty)) floor.push({ tx, ty });
  }

  it('is as short as the breadth-first distance, and every step is a floor neighbour', () => {
    const rng = new Rng(4);
    for (let i = 0; i < 60; i++) {
      const a = rng.pick(floor);
      const b = rng.pick(floor);
      const path = findPath(tiles, a, b)!;
      const bfs = distanceField(tiles, [a])[tiles.index(b.tx, b.ty)];
      expect(path).toHaveLength(bfs);
      let prev = a;
      for (const t of path) {
        expect(Math.abs(t.tx - prev.tx) + Math.abs(t.ty - prev.ty)).toBe(1);
        expect(tiles.isFloor(t.tx, t.ty)).toBe(true);
        prev = t;
      }
      if (path.length > 0) expect(path[path.length - 1]).toEqual(b);
    }
  });

  it('returns [] when already there, null when there is no way', () => {
    const map = fromAscii(['#######', '#...#.#', '#.#.#.#', '#.#...#', '#######']);
    expect(findPath(map, { tx: 1, ty: 1 }, { tx: 1, ty: 1 })).toEqual([]);
    expect(findPath(map, { tx: 1, ty: 1 }, { tx: 2, ty: 2 })).toBeNull(); // a wall
    const split = fromAscii(['#####', '#.#.#', '#####']);
    expect(findPath(split, { tx: 1, ty: 1 }, { tx: 3, ty: 1 })).toBeNull();
  });
});

describe('smoothPath', () => {
  it('cuts straight across open space', () => {
    const room = fromAscii(['#######', '#.....#', '#.....#', '#.....#', '#######']);
    const start = room.center({ tx: 1, ty: 1 });
    const tiles = findPath(room, { tx: 1, ty: 1 }, { tx: 5, ty: 3 })!;
    const points = tiles.map((t) => room.center(t));
    const smooth = smoothPath(room, start, points, 10);
    expect(smooth).toEqual([room.center({ tx: 5, ty: 3 })]);
  });

  it('keeps every leg walkable around corners', () => {
    const { tiles } = generateMap(mapOptionsFromConfig(12));
    const from = { tx: 1, ty: 1 };
    const to = { tx: tiles.width - 2, ty: tiles.height - 2 };
    const route = findPath(tiles, from, to)!;
    const points = route.map((t) => tiles.center(t));
    const smooth = smoothPath(tiles, tiles.center(from), points, 11);
    expect(smooth.length).toBeLessThan(points.length);
    expect(smooth[smooth.length - 1]).toEqual(points[points.length - 1]);
    let prev = tiles.center(from);
    for (const p of smooth) {
      expect(lineWalkable(tiles, prev, p, 11)).toBe(true);
      prev = p;
    }
  });
});
