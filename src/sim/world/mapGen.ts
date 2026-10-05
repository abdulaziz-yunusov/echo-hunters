import { ENDLESS } from '@/config/levels';
import { GAME } from '@/config/game';
import { HUNTER_COMMON } from '@/config/hunters';
import type { Rect } from '@/core/geometry';
import { deriveSeed, Rng } from '@/core/rng';
import { distanceField, UNREACHABLE } from './pathfinding';
import { placeSurfaces } from './surfaces';
import { DIRS4, FLOOR, TileMap, WALL, type TileCoord } from './tileMap';

export interface MapGenOptions {
  seed: number;
  /** Maze cells; the tile grid is (cells * 2 + 1) in each direction. */
  cellsX: number;
  cellsY: number;
  tileSize: number;
  /** Share of remaining inner walls knocked out to create loops (0..1). */
  loopRatio: number;
  rooms: {
    min: number;
    max: number;
    /** Odd, so rooms line up with maze cells. */
    size: number;
    minTilesFromSpawn: number;
  };
  coreCount: number;
  /** Hunter spawn tiles must be at least this many steps from every player spawn. */
  hunterSpawnMinTiles: number;
  /** Reject the map if it has fewer hunter spawn candidates than this. */
  hunterSpawnsNeeded: number;
  /** 1 = solo (one corner spawn), 2 = duel (opposite corners). */
  players: 1 | 2;
  /** Duel fairness: most steps one player may be closer to the beacon than the other. */
  beaconMaxStepDifference: number;
  /** Duel: cores a player must carry to the beacon (their route takes this many cores). */
  duelCoresToWin: number;
  /** Duel fairness: most steps one player's best route to win may be longer than the other's. */
  coreMaxRouteDifference: number;
  /** Seeds tried (seed, seed+1, …) before giving up. */
  maxAttempts: number;
}

export interface MapLayout {
  /** The seed that produced this layout; later than the requested one if retries were needed. */
  seed: number;
  tiles: TileMap;
  /** Open areas, in tile units. */
  rooms: Rect[];
  /** One per player. */
  spawns: TileCoord[];
  /** Farthest (and, in a duel, fairest) tile from the spawns. */
  beacon: TileCoord;
  /** Signal Core positions, one per core, each at a room center. */
  cores: TileCoord[];
  /** Floor tiles far enough from every player, in random order: take the first N. */
  hunterSpawns: TileCoord[];
}

/** Map options from CONFIG. `scale` grows both dimensions (endless levels). */
export function mapOptionsFromConfig(
  seed: number,
  { players = 1, scale = 1 }: { players?: 1 | 2; scale?: number } = {},
): MapGenOptions {
  const { map } = GAME;
  return {
    seed,
    cellsX: Math.round(map.cellsX * scale),
    cellsY: Math.round(map.cellsY * scale),
    tileSize: map.tileSize,
    loopRatio: map.loopRatio,
    rooms: map.rooms,
    coreCount: GAME.objectives.coresPerLevel,
    hunterSpawnMinTiles: HUNTER_COMMON.spawnMinTiles,
    hunterSpawnsNeeded: ENDLESS.maxHunters,
    players,
    beaconMaxStepDifference: GAME.duel.beaconMaxStepDifference,
    duelCoresToWin: GAME.duel.coresToWin,
    coreMaxRouteDifference: GAME.duel.coreMaxRouteDifference,
    maxAttempts: map.maxAttempts,
  };
}

/**
 * Generate a map. Deterministic: the same options always give the same map,
 * which is how both duel clients build identical arenas from a shared seed.
 * If a seed gives an unusable map, seed+1, seed+2, … are tried.
 */
export function generateMap(options: MapGenOptions): MapLayout {
  assertValidOptions(options);
  for (let attempt = 0; attempt < options.maxAttempts; attempt++) {
    const layout = tryGenerate(options, (options.seed + attempt) >>> 0);
    if (layout) return layout;
  }
  throw new Error(`No valid map in ${options.maxAttempts} seeds from ${options.seed}`);
}

function tryGenerate(o: MapGenOptions, seed: number): MapLayout | null {
  // Every random choice below comes from this one stream, in a fixed order.
  const rng = new Rng(deriveSeed(seed, 'map'));
  const tiles = new TileMap(o.cellsX * 2 + 1, o.cellsY * 2 + 1, o.tileSize, WALL);

  carveMaze(tiles, o.cellsX, o.cellsY, rng);
  knockOutWalls(tiles, o.loopRatio, rng);
  const spawns = pickSpawns(tiles, o.players, rng);
  const rooms = carveRooms(tiles, o.rooms, spawns, rng);
  if (rooms.length < o.coreCount) return null;

  const fields = spawns.map((s) => distanceField(tiles, [s]));
  if (!allFloorReachable(tiles, fields[0])) return null;

  const beacon = pickBeacon(tiles, fields, o.beaconMaxStepDifference);
  const shuffled = rng
    .shuffle([...rooms])
    .map((r) => ({ tx: r.x + (r.w - 1) / 2, ty: r.y + (r.h - 1) / 2 }));
  const fair =
    o.players === 2
      ? pickFairCores(tiles, shuffled, fields, beacon, o.coreCount, o.duelCoresToWin)
      : { cores: shuffled.slice(0, o.coreCount), gap: 0 };
  if (fair.gap > o.coreMaxRouteDifference) return null;
  const { cores } = fair;
  if (cores.some((c) => sameTile(c, beacon))) return null;

  const hunterSpawns = pickHunterSpawns(tiles, fields, o.hunterSpawnMinTiles, [beacon, ...cores]);
  if (hunterSpawns.length < o.hunterSpawnsNeeded) return null;
  rng.shuffle(hunterSpawns);

  // Last, on their own stream: floors never change the maze, rooms or spawns.
  const areaScale = (o.cellsX * o.cellsY) / (GAME.map.cellsX * GAME.map.cellsY);
  placeSurfaces(tiles, { seed, spawns, cores, beacon, areaScale });

  return { seed, tiles, rooms, spawns, beacon, cores, hunterSpawns };
}

/** Recursive backtracker (iterative, so big maps cannot overflow the call stack). */
function carveMaze(tiles: TileMap, cellsX: number, cellsY: number, rng: Rng): void {
  const visited = new Uint8Array(cellsX * cellsY);
  const start = rng.int(0, cellsX * cellsY - 1);
  const stack = [start];
  visited[start] = 1;
  tiles.set((start % cellsX) * 2 + 1, Math.floor(start / cellsX) * 2 + 1, FLOOR);

  while (stack.length > 0) {
    const cell = stack[stack.length - 1];
    const cx = cell % cellsX;
    const cy = (cell - cx) / cellsX;

    const options = DIRS4.filter(([dx, dy]) => {
      const nx = cx + dx;
      const ny = cy + dy;
      return nx >= 0 && ny >= 0 && nx < cellsX && ny < cellsY && !visited[ny * cellsX + nx];
    });
    if (options.length === 0) {
      stack.pop();
      continue;
    }

    const [dx, dy] = rng.pick(options);
    const nx = cx + dx;
    const ny = cy + dy;
    tiles.set(cx * 2 + 1 + dx, cy * 2 + 1 + dy, FLOOR); // the wall between the two cells
    tiles.set(nx * 2 + 1, ny * 2 + 1, FLOOR);
    visited[ny * cellsX + nx] = 1;
    stack.push(ny * cellsX + nx);
  }
}

/**
 * Open a share of the walls that separate two cells. Loops matter: in a
 * perfect maze a chase can never be escaped.
 */
function knockOutWalls(tiles: TileMap, ratio: number, rng: Rng): void {
  const candidates: [number, number][] = [];
  for (let ty = 1; ty < tiles.height - 1; ty++) {
    for (let tx = 1; tx < tiles.width - 1; tx++) {
      // Between two cells = exactly one coordinate is even.
      const between = (tx % 2 === 1) !== (ty % 2 === 1);
      if (between && tiles.isWall(tx, ty)) candidates.push([tx, ty]);
    }
  }
  const count = Math.round(candidates.length * ratio);
  for (const [tx, ty] of rng.shuffle(candidates).slice(0, count)) tiles.set(tx, ty, FLOOR);
}

/** Solo: a random corner. Duel: that corner and the opposite one. */
function pickSpawns(tiles: TileMap, players: 1 | 2, rng: Rng): TileCoord[] {
  const right = tiles.width - 2;
  const bottom = tiles.height - 2;
  // Clockwise, so i and i + 2 are opposite corners.
  const corners: TileCoord[] = [
    { tx: 1, ty: 1 },
    { tx: right, ty: 1 },
    { tx: right, ty: bottom },
    { tx: 1, ty: bottom },
  ];
  const first = rng.int(0, 3);
  return players === 1 ? [corners[first]] : [corners[first], corners[(first + 2) % 4]];
}

/** Carve non-overlapping square rooms on odd (cell-aligned) positions, away from spawns. */
function carveRooms(
  tiles: TileMap,
  cfg: MapGenOptions['rooms'],
  spawns: readonly TileCoord[],
  rng: Rng,
): Rect[] {
  const target = rng.int(cfg.min, cfg.max);
  const size = cfg.size;
  // Odd x from 1 up to the last position where the room still fits inside the border.
  const slotsX = Math.floor((tiles.width - 1 - size - 1) / 2);
  const slotsY = Math.floor((tiles.height - 1 - size - 1) / 2);
  const rooms: Rect[] = [];
  if (slotsX < 0 || slotsY < 0) return rooms;

  for (let tries = 0; tries < target * 40 && rooms.length < target; tries++) {
    const room: Rect = {
      x: 1 + 2 * rng.int(0, slotsX),
      y: 1 + 2 * rng.int(0, slotsY),
      w: size,
      h: size,
    };
    if (spawns.some((s) => distanceToRect(s, room) < cfg.minTilesFromSpawn)) continue;
    // Keep at least one wall line between rooms.
    if (rooms.some((r) => rectsOverlap(grow(r, 1), room))) continue;

    for (let ty = room.y; ty < room.y + room.h; ty++) {
      for (let tx = room.x; tx < room.x + room.w; tx++) tiles.set(tx, ty, FLOOR);
    }
    rooms.push(room);
  }
  return rooms;
}

/**
 * Fairness first, then distance: among tiles where no player is more than
 * `maxDifference` steps closer than another (or the fairest tiles, if none
 * qualify), pick the one farthest from the nearest spawn. Solo has one
 * spawn, so this is simply the farthest tile. Ties go to the lowest index.
 */
/**
 * Duel (Phase 28): of every way to put the cores in the rooms, the one where
 * both players' best route (spawn → enough cores → beacon) is closest in
 * length. Ties go to the earliest rooms in the (seeded) shuffled order.
 * Without this, the player whose spawn happened to be nearer the cores won
 * about 80% of bot duels: the map decided the race, not the players.
 */
function pickFairCores(
  tiles: TileMap,
  rooms: readonly TileCoord[],
  spawnFields: readonly Int32Array[],
  beacon: TileCoord,
  count: number,
  need: number,
): { cores: TileCoord[]; gap: number } {
  const at = (field: Int32Array, t: TileCoord) => field[tiles.index(t.tx, t.ty)];
  const roomFields = rooms.map((r) => distanceField(tiles, [r]));
  const toBeacon = rooms.map((_, i) => at(roomFields[i], beacon));
  let best: number[] = [];
  let bestGap = Infinity;
  for (const combo of combinations(rooms.length, count)) {
    const routes = spawnFields.map((f) =>
      shortestRoute(
        combo,
        need,
        (i) => at(f, rooms[i]),
        (i, j) => at(roomFields[i], rooms[j]),
        toBeacon,
      ),
    );
    const gap = Math.max(...routes) - Math.min(...routes);
    if (gap < bestGap) {
      best = combo;
      bestGap = gap;
    }
  }
  return { cores: best.map((i) => rooms[i]), gap: bestGap };
}

/** Shortest walk from a spawn through `need` of these rooms (any order), ending at the beacon. */
function shortestRoute(
  rooms: readonly number[],
  need: number,
  fromSpawn: (room: number) => number,
  between: (a: number, b: number) => number,
  toBeacon: readonly number[],
): number {
  let best = Infinity;
  const walk = (last: number, used: number[], length: number) => {
    if (length >= best) return;
    if (used.length === need) {
      best = Math.min(best, length + toBeacon[last]);
      return;
    }
    for (const r of rooms) {
      if (used.includes(r)) continue;
      walk(r, [...used, r], length + between(last, r));
    }
  };
  for (const r of rooms) walk(r, [r], fromSpawn(r));
  return best;
}

/** Every way to choose k of 0..n-1, in increasing (lexicographic) order. */
function combinations(n: number, k: number): number[][] {
  const out: number[][] = [];
  const pick = (from: number, chosen: number[]) => {
    if (chosen.length === k) {
      out.push(chosen);
      return;
    }
    for (let i = from; i < n; i++) pick(i + 1, [...chosen, i]);
  };
  pick(0, []);
  return out;
}

function pickBeacon(
  tiles: TileMap,
  fields: readonly Int32Array[],
  maxDifference: number,
): TileCoord {
  const count = tiles.tiles.length;
  const nearest = new Int32Array(count).fill(UNREACHABLE);
  const spread = new Int32Array(count);
  let fairest = Infinity;
  for (let i = 0; i < count; i++) {
    let min = Infinity;
    let max = -Infinity;
    for (const f of fields) {
      min = Math.min(min, f[i]);
      max = Math.max(max, f[i]);
    }
    if (min === UNREACHABLE) continue;
    nearest[i] = min;
    spread[i] = max - min;
    fairest = Math.min(fairest, spread[i]);
  }

  const allowed = Math.max(fairest, maxDifference);
  let best = -1;
  for (let i = 0; i < count; i++) {
    if (nearest[i] === UNREACHABLE || spread[i] > allowed) continue;
    if (best < 0 || nearest[i] > nearest[best]) best = i;
  }
  return tiles.coordOf(best);
}

function pickHunterSpawns(
  tiles: TileMap,
  fields: readonly Int32Array[],
  minTiles: number,
  exclude: readonly TileCoord[],
): TileCoord[] {
  const result: TileCoord[] = [];
  for (let i = 0; i < tiles.tiles.length; i++) {
    if (fields.every((f) => f[i] >= minTiles)) {
      const t = tiles.coordOf(i);
      if (!exclude.some((e) => sameTile(e, t))) result.push(t);
    }
  }
  return result;
}

function allFloorReachable(tiles: TileMap, field: Int32Array): boolean {
  for (let i = 0; i < tiles.tiles.length; i++) {
    if (tiles.tiles[i] === FLOOR && field[i] === UNREACHABLE) return false;
  }
  return true;
}

function assertValidOptions(o: MapGenOptions): void {
  const problems: string[] = [];
  if (o.cellsX < 2 || o.cellsY < 2) problems.push('need at least 2x2 cells');
  if (o.rooms.size % 2 === 0) problems.push('rooms.size must be odd');
  if (o.rooms.min > o.rooms.max) problems.push('rooms.min > rooms.max');
  if (o.coreCount > o.rooms.max) problems.push('more cores than rooms');
  if (o.loopRatio < 0 || o.loopRatio > 1) problems.push('loopRatio must be 0..1');
  if (o.maxAttempts < 1) problems.push('maxAttempts must be >= 1');
  if (problems.length > 0) throw new Error(`Invalid map options: ${problems.join('; ')}`);
}

/** Chebyshev distance from a tile to the nearest tile of a rect (0 if inside). */
function distanceToRect(t: TileCoord, r: Rect): number {
  const dx = Math.max(r.x - t.tx, 0, t.tx - (r.x + r.w - 1));
  const dy = Math.max(r.y - t.ty, 0, t.ty - (r.y + r.h - 1));
  return Math.max(dx, dy);
}

function rectsOverlap(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

function grow(r: Rect, by: number): Rect {
  return { x: r.x - by, y: r.y - by, w: r.w + by * 2, h: r.h + by * 2 };
}

function sameTile(a: TileCoord, b: TileCoord): boolean {
  return a.tx === b.tx && a.ty === b.ty;
}
