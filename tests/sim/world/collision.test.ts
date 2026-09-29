import { describe, expect, it } from 'vitest';
import { moveCircle, resolveCircle } from '@/sim/world/collision';
import { fromAscii } from '../../helpers/maps';

// Floor spans x 32..192, y 32..128.
const ROOM = fromAscii([
  '#######', //
  '#.....#',
  '#.....#',
  '#.....#',
  '#######',
]);
const R = 8;

describe('resolveCircle', () => {
  it('pushes a circle out of a wall along the wall normal', () => {
    const r = resolveCircle(ROOM, 36, 64, R);
    expect(r).toMatchObject({ x: 40, y: 64, hit: true, nx: 1, ny: 0 });
  });

  it('leaves a free circle alone', () => {
    expect(resolveCircle(ROOM, 100, 80, R)).toEqual({ x: 100, y: 80, hit: false, nx: 0, ny: 0 });
  });

  it('settles into an inside corner', () => {
    const r = resolveCircle(ROOM, 34, 34, R);
    expect(r.x).toBeCloseTo(40);
    expect(r.y).toBeCloseTo(40);
    expect(r.nx).toBeGreaterThan(0);
    expect(r.ny).toBeGreaterThan(0);
  });
});

describe('moveCircle', () => {
  it('moves freely in open space', () => {
    expect(moveCircle(ROOM, 100, 80, R, 5, -3)).toEqual({
      x: 105,
      y: 77,
      hit: false,
      nx: 0,
      ny: 0,
    });
  });

  it('slides along a wall, keeping the sideways part of the move', () => {
    const r = moveCircle(ROOM, 40, 64, R, -5, 3);
    expect(r.x).toBeCloseTo(40);
    expect(r.y).toBeCloseTo(67);
    expect(r.hit).toBe(true);
    expect([r.nx, r.ny]).toEqual([1, 0]);
  });

  it('never tunnels through a wall, however far it moves', () => {
    const r = moveCircle(ROOM, 100, 80, R, 5000, 0);
    expect(r.x).toBeCloseTo(192 - R);
  });

  it('stops in a corner when moving diagonally into it', () => {
    const r = moveCircle(ROOM, 60, 60, R, -100, -100);
    expect(r.x).toBeCloseTo(40);
    expect(r.y).toBeCloseTo(40);
  });

  it('fits through a one-tile corridor without touching its walls', () => {
    const corridor = fromAscii(['#####', '#...#', '#####']);
    expect(moveCircle(corridor, 48, 48, R, 60, 0)).toEqual({
      x: 108,
      y: 48,
      hit: false,
      nx: 0,
      ny: 0,
    });
  });
});
