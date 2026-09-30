import { SURFACE_PLACEMENT, type SurfaceId } from '@/config/surfaces';
import { deriveSeed, Rng } from '@/core/rng';
import { distanceField } from './pathfinding';
import { DIRS4, type TileCoord, type TileMap } from './tileMap';

export interface SurfaceSites {
  /** The map's seed; surfaces use their own stream, so the maze itself never changes. */
  seed: number;
  spawns: readonly TileCoord[];
  cores: readonly TileCoord[];
  beacon: TileCoord;
  /** Map area relative to a base-size map: patch counts grow with it. */
  areaScale: number;
}

/**
 * Lay metal grates and moss on a generated map (Phase 16). Deterministic
 * from the seed, so both duel players walk the same floors.
 *
 * - Metal starts a few steps from a core or the beacon (the risky routes
 *   are loud), never near a spawn.
 * - Moss starts in dead ends and side corridors (quiet hiding places).
 *
 * Each patch grows outward from its start over normal floor.
 */
export function placeSurfaces(tiles: TileMap, sites: SurfaceSites): void {
  const cfg = SURFACE_PLACEMENT;
  const rng = new Rng(deriveSeed(sites.seed, 'surfaces'));
  const count = (base: number) => Math.round(base * sites.areaScale);
  const fromSpawn = distanceField(tiles, sites.spawns);
  const normal = (i: number) => tiles.surfaces[i] === 0;
  const farFromSpawn = (i: number) => fromSpawn[i] >= cfg.metalMinFromSpawn;

  const objectives = [sites.beacon, ...sites.cores];
  const fields = objectives.map((o) => distanceField(tiles, [o]));
  for (let n = 0; n < count(cfg.metalPatches); n++) {
    const field = fields[rng.int(0, fields.length - 1)];
    const { min, max } = cfg.metalFromObjective;
    const starts = floorIndices(tiles).filter(
      (i) => field[i] >= min && field[i] <= max && farFromSpawn(i) && normal(i),
    );
    if (starts.length === 0) continue;
    grow(tiles, rng.pick(starts), 'metal', (i) => farFromSpawn(i) && normal(i), rng);
  }

  // Dead ends first (in random order), then corridor tiles, for as many moss patches as needed.
  const deadEnds: number[] = [];
  const corridors: number[] = [];
  for (const i of floorIndices(tiles)) {
    const exits = floorNeighbours(tiles, i).length;
    if (exits === 1) deadEnds.push(i);
    else if (exits === 2) corridors.push(i);
  }
  const starts = [...rng.shuffle(deadEnds), ...rng.shuffle(corridors)];
  let placed = 0;
  for (const start of starts) {
    if (placed >= count(cfg.softPatches)) break;
    if (!normal(start)) continue;
    grow(tiles, start, 'soft', normal, rng);
    placed++;
  }
}

/** Paint up to `patchSize` tiles, breadth-first from `start`, over tiles `allowed` accepts. */
function grow(
  tiles: TileMap,
  start: number,
  surface: SurfaceId,
  allowed: (i: number) => boolean,
  rng: Rng,
): void {
  const queue = [start];
  const seen = new Set(queue);
  let painted = 0;
  while (queue.length > 0 && painted < SURFACE_PLACEMENT.patchSize) {
    const i = queue.shift()!;
    const { tx, ty } = tiles.coordOf(i);
    tiles.setSurface(tx, ty, surface);
    painted++;
    for (const n of rng.shuffle(floorNeighbours(tiles, i))) {
      if (seen.has(n) || !allowed(n)) continue;
      seen.add(n);
      queue.push(n);
    }
  }
}

function floorIndices(tiles: TileMap): number[] {
  const result: number[] = [];
  for (let i = 0; i < tiles.tiles.length; i++) {
    const { tx, ty } = tiles.coordOf(i);
    if (tiles.isFloor(tx, ty)) result.push(i);
  }
  return result;
}

function floorNeighbours(tiles: TileMap, i: number): number[] {
  const { tx, ty } = tiles.coordOf(i);
  const result: number[] = [];
  for (const [dx, dy] of DIRS4) {
    if (tiles.isFloor(tx + dx, ty + dy)) result.push(tiles.index(tx + dx, ty + dy));
  }
  return result;
}
