import { describe, expect, it } from 'vitest';
import { pointInPolygon } from '@/core/geometry';
import { buildWallGeometry } from '@/sim/world/edges';
import { generateMap, mapOptionsFromConfig } from '@/sim/world/mapGen';
import { hasLineOfSight, visibilityPolygon } from '@/sim/world/visibility';
import { polygonArea } from '../../helpers/geometry';
import { fromAscii } from '../../helpers/maps';

// Room: floor x 32..320, y 32..192. Pillar at tile (4,4): x 128..160, y 128..160.
const walls = buildWallGeometry(
  fromAscii([
    '###########',
    '#.........#',
    '#.........#',
    '#.........#',
    '#...#.....#',
    '#.........#',
    '###########',
  ]),
);
const O = { x: 176, y: 112 }; // center of tile (5,3)

describe('visibilityPolygon', () => {
  const poly = visibilityPolygon(walls, O.x, O.y, 1000);
  const sees = (x: number, y: number) => pointInPolygon(x, y, poly);

  it('covers open floor in line of sight', () => {
    expect(sees(300, 60)).toBe(true);
    expect(sees(40, 40)).toBe(true);
    expect(sees(300, 185)).toBe(true);
  });

  it('casts a shadow behind the pillar', () => {
    // Straight past the pillar center, as seen from O.
    expect(sees(124.8, 163.2)).toBe(false);
  });

  it('never reaches into walls', () => {
    expect(sees(16, 112)).toBe(false);
    expect(sees(176, 200)).toBe(false);
    expect(sees(144, 144)).toBe(false); // inside the pillar
  });

  it('stops each ray at the first wall', () => {
    for (let i = 0; i < poly.length; i += 2) {
      const x = poly[i];
      const y = poly[i + 1];
      expect(x).toBeGreaterThanOrEqual(32 - 1e-3);
      expect(x).toBeLessThanOrEqual(320 + 1e-3);
      expect(y).toBeGreaterThanOrEqual(32 - 1e-3);
      expect(y).toBeLessThanOrEqual(192 + 1e-3);
    }
  });

  it('is a circle in open space', () => {
    const r = 20;
    const small = visibilityPolygon(walls, O.x, O.y, r);
    for (let i = 0; i < small.length; i += 2) {
      expect(Math.hypot(small[i] - O.x, small[i + 1] - O.y)).toBeCloseTo(r, 3);
    }
    expect(polygonArea(small) / (Math.PI * r * r)).toBeGreaterThan(0.99);
  });

  it('is clipped by walls inside its radius', () => {
    // 80 px from the top-left corner region: walls at x=32 and y=32 cut the circle.
    const p = visibilityPolygon(walls, 64, 64, 80);
    expect(polygonArea(p)).toBeLessThan(Math.PI * 80 * 80 * 0.75);
    expect(pointInPolygon(20, 64, p)).toBe(false);
  });

  it('works from any floor point of a real maze (never empty, never leaks)', () => {
    const layout = generateMap(mapOptionsFromConfig(3));
    const g = buildWallGeometry(layout.tiles);
    const { tiles } = layout;
    for (let ty = 1; ty < tiles.height - 1; ty += 3) {
      for (let tx = 1; tx < tiles.width - 1; tx += 3) {
        if (!tiles.isFloor(tx, ty)) continue;
        const c = tiles.center({ tx, ty });
        const p = visibilityPolygon(g, c.x, c.y, 400);
        expect(polygonArea(p)).toBeGreaterThan(32 * 32 * 0.5);
        for (let i = 0; i < p.length; i += 2) {
          // Every vertex sits on floor or exactly on a wall face (0.5 px nudge back toward the origin).
          const bx = p[i] + Math.sign(c.x - p[i]) * 0.5;
          const by = p[i + 1] + Math.sign(c.y - p[i + 1]) * 0.5;
          expect(tiles.isFloor(tiles.toTile(bx), tiles.toTile(by))).toBe(true);
        }
      }
    }
  });
});

describe('hasLineOfSight', () => {
  it('is true across open floor', () => {
    expect(hasLineOfSight(walls, O.x, O.y, 300, 60)).toBe(true);
  });

  it('is false through a wall', () => {
    expect(hasLineOfSight(walls, O.x, O.y, 124.8, 163.2)).toBe(false);
    expect(hasLineOfSight(walls, 48, 48, 48, 240)).toBe(false);
  });
});
