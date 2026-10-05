import { describe, expect, it } from 'vitest';
import {
  generateMap,
  mapOptionsFromConfig,
  type MapGenOptions,
  type MapLayout,
} from '@/sim/world/mapGen';
import { DIRS4, FLOOR, type TileCoord, type TileMap } from '@/sim/world/tileMap';

const opts = mapOptionsFromConfig;

/** Independent BFS (not the one under test in pathfinding.ts). */
function steps(tiles: TileMap, from: TileCoord): Map<number, number> {
  const dist = new Map<number, number>([[tiles.index(from.tx, from.ty), 0]]);
  const queue: TileCoord[] = [from];
  while (queue.length > 0) {
    const t = queue.shift()!;
    const d = dist.get(tiles.index(t.tx, t.ty))!;
    for (const [dx, dy] of DIRS4) {
      const n = { tx: t.tx + dx, ty: t.ty + dy };
      const key = tiles.index(n.tx, n.ty);
      if (tiles.isFloor(n.tx, n.ty) && !dist.has(key)) {
        dist.set(key, d + 1);
        queue.push(n);
      }
    }
  }
  return dist;
}

/** Every rule the GDD and plan require of a finished map. Returns the broken rules. */
function problems(layout: MapLayout, o: MapGenOptions): string[] {
  const { tiles, rooms, spawns, beacon, cores, hunterSpawns } = layout;
  const out: string[] = [];
  const fail = (msg: string) => out.push(`seed ${layout.seed}: ${msg}`);
  const inRect = (t: TileCoord, r: { x: number; y: number; w: number; h: number }) =>
    t.tx >= r.x && t.tx < r.x + r.w && t.ty >= r.y && t.ty < r.y + r.h;

  if (tiles.width !== o.cellsX * 2 + 1 || tiles.height !== o.cellsY * 2 + 1) fail('wrong size');
  for (let x = 0; x < tiles.width; x++) {
    if (tiles.isFloor(x, 0) || tiles.isFloor(x, tiles.height - 1)) fail('hole in border');
  }
  for (let y = 0; y < tiles.height; y++) {
    if (tiles.isFloor(0, y) || tiles.isFloor(tiles.width - 1, y)) fail('hole in border');
  }

  const fromSpawn = spawns.map((s) => steps(tiles, s));
  if (fromSpawn[0].size !== tiles.countFloor()) fail('floor not fully connected');

  // Loops: a connected tree has exactly (nodes - 1) links; more means cycles.
  let links = 0;
  for (let y = 0; y < tiles.height; y++) {
    for (let x = 0; x < tiles.width; x++) {
      if (!tiles.isFloor(x, y)) continue;
      if (tiles.isFloor(x + 1, y)) links++;
      if (tiles.isFloor(x, y + 1)) links++;
    }
  }
  if (links <= tiles.countFloor() - 1) fail('no loops');

  if (spawns.length !== o.players) fail('wrong spawn count');
  const [right, bottom] = [tiles.width - 2, tiles.height - 2];
  for (const s of spawns) {
    if (!(s.tx === 1 || s.tx === right) || !(s.ty === 1 || s.ty === bottom))
      fail('spawn not in a corner');
  }
  if (o.players === 2 && (spawns[0].tx === spawns[1].tx || spawns[0].ty === spawns[1].ty)) {
    fail('duel spawns not in opposite corners');
  }

  if (rooms.length < Math.max(o.rooms.min, o.coreCount) || rooms.length > o.rooms.max) {
    fail(`room count ${rooms.length}`);
  }
  for (const r of rooms) {
    for (let y = r.y; y < r.y + r.h; y++) {
      for (let x = r.x; x < r.x + r.w; x++) if (!tiles.isFloor(x, y)) fail('room not open');
    }
    for (const s of spawns) {
      const dx = Math.max(r.x - s.tx, 0, s.tx - (r.x + r.w - 1));
      const dy = Math.max(r.y - s.ty, 0, s.ty - (r.y + r.h - 1));
      if (Math.max(dx, dy) < o.rooms.minTilesFromSpawn) fail('room too close to spawn');
    }
  }

  if (cores.length !== o.coreCount) fail('wrong core count');
  const coreKeys = new Set(cores.map((c) => tiles.index(c.tx, c.ty)));
  if (coreKeys.size !== cores.length) fail('two cores on one tile');
  if (!cores.every((c) => rooms.some((r) => inRect(c, r)))) fail('core outside rooms');

  // Beacon: fair within tolerance (or as fair as the map allows), and farthest among fair tiles.
  const nearestOf = (i: number) => Math.min(...fromSpawn.map((d) => d.get(i)!));
  const spreadOf = (i: number) => Math.max(...fromSpawn.map((d) => d.get(i)!)) - nearestOf(i);
  const floorIds = [...tiles.tiles.keys()].filter((i) => tiles.tiles[i] === FLOOR);
  const allowed = Math.max(Math.min(...floorIds.map(spreadOf)), o.beaconMaxStepDifference);
  const b = tiles.index(beacon.tx, beacon.ty);
  if (spreadOf(b) > allowed) fail(`unfair beacon (spread ${spreadOf(b)})`);
  if (floorIds.some((i) => spreadOf(i) <= allowed && nearestOf(i) > nearestOf(b))) {
    fail('a fair tile farther than the beacon exists');
  }
  if (coreKeys.has(b)) fail('beacon on a core');

  if (hunterSpawns.length < o.hunterSpawnsNeeded) fail('too few hunter spawns');
  const tooClose = hunterSpawns.some((h) =>
    fromSpawn.some((d) => (d.get(tiles.index(h.tx, h.ty)) ?? -1) < o.hunterSpawnMinTiles),
  );
  if (tooClose) fail('hunter spawn too close to a player');
  return out;
}

describe('generateMap', () => {
  it('is deterministic: the same seed gives the same map', () => {
    for (const seed of [0, 1, 42, 123456789, 0xffffffff]) {
      const a = generateMap(opts(seed));
      const b = generateMap(opts(seed));
      expect(b.tiles.tiles).toEqual(a.tiles.tiles);
      expect({ ...b, tiles: null }).toEqual({ ...a, tiles: null });
    }
  });

  it('different seeds give different maps', () => {
    expect(generateMap(opts(2)).tiles.tiles).not.toEqual(generateMap(opts(1)).tiles.tiles);
  });

  it('1000 solo seeds all satisfy every map rule', () => {
    const all: string[] = [];
    for (let seed = 0; seed < 1000; seed++) {
      const o = opts(seed);
      all.push(...problems(generateMap(o), o));
    }
    expect(all).toEqual([]);
  });

  it('200 duel seeds satisfy every rule, including a fair beacon', () => {
    const all: string[] = [];
    for (let seed = 0; seed < 200; seed++) {
      const o = opts(seed, { players: 2 });
      all.push(...problems(generateMap(o), o));
    }
    expect(all).toEqual([]);
  });

  it("duel cores leave both players' best routes within the allowed difference (Phase 28)", () => {
    /** Shortest spawn → 2 cores (either order) → beacon, by the independent BFS. */
    const route = (layout: MapLayout, spawn: TileCoord) => {
      const { tiles, cores, beacon } = layout;
      const d = (a: TileCoord, b: TileCoord) => steps(tiles, a).get(tiles.index(b.tx, b.ty))!;
      let best = Infinity;
      for (const a of cores) {
        for (const b of cores) {
          if (a !== b) best = Math.min(best, d(spawn, a) + d(a, b) + d(b, beacon));
        }
      }
      return best;
    };
    for (let seed = 0; seed < 60; seed++) {
      const o = opts(seed, { players: 2 });
      const layout = generateMap(o);
      const [a, b] = layout.spawns.map((s) => route(layout, s));
      expect(Math.abs(a - b), `seed ${seed}`).toBeLessThanOrEqual(o.coreMaxRouteDifference);
    }
  });

  it('scaled maps grow and stay valid', () => {
    const base = generateMap(opts(7));
    const o = opts(7, { scale: 1.6 });
    const big = generateMap(o);
    expect(big.tiles.width).toBeGreaterThan(base.tiles.width);
    expect(problems(big, o)).toEqual([]);
  });

  it('retries the next seed when a map is unusable, reproducibly', () => {
    // Half-size maps: about half of all seeds cannot fit the rooms, so retries happen.
    let retried = 0;
    for (let seed = 0; seed < 40; seed++) {
      const o = { ...opts(seed), cellsX: 10, cellsY: 6, maxAttempts: 30 };
      const layout = generateMap(o);
      expect(layout.seed).toBeGreaterThanOrEqual(seed);
      expect(problems(layout, o)).toEqual([]);
      if (layout.seed !== seed) {
        retried++;
        // Asking for the seed it landed on reproduces the same map directly.
        expect(generateMap({ ...o, seed: layout.seed }).tiles.tiles).toEqual(layout.tiles.tiles);
      }
    }
    expect(retried).toBeGreaterThan(0);
  });

  it('rejects impossible options with a clear error', () => {
    expect(() => generateMap({ ...opts(1), rooms: { ...opts(1).rooms, size: 4 } })).toThrow(/odd/);
    expect(() => generateMap({ ...opts(1), cellsX: 3, cellsY: 3, maxAttempts: 3 })).toThrow(
      /No valid map/,
    );
  });
});
