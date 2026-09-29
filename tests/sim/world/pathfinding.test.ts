import { describe, expect, it } from 'vitest';
import { distanceField, UNREACHABLE } from '@/sim/world/pathfinding';
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
