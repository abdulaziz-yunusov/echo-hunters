import { CELLS, EDITOR, type CellCode, type CellId } from '@/config/editor';
import type { EmitterTypeId } from '@/config/emitters';
import { GAME } from '@/config/game';
import type { HunterTypeId } from '@/config/hunters';
import type { PickupTypeId } from '@/config/pickups';
import { hashString } from '@/core/rng';
import type { MapLayout } from './mapGen';
import { distanceField, UNREACHABLE } from './pathfinding';
import { FLOOR, TileMap, type TileCoord } from './tileMap';

/*
 * Hand-made maps (Phase 13). A map is a grid of one-letter cells (see
 * config/editor.ts); it travels as text, run-length packed:
 * `v1.<width>x<height>.<runs>` where a run is an optional count and a
 * letter ("12w" = twelve walls), all URL-safe.
 */

export interface CustomMap {
  width: number;
  height: number;
  /** One cell per tile, row by row. */
  cells: CellCode[];
}

const VERSION = 'v1';
const CODES = new Set<string>(Object.values(CELLS));
const CELL_OF = Object.fromEntries(Object.entries(CELLS).map(([id, code]) => [code, id])) as Record<
  CellCode,
  CellId
>;

/** Cells that are markers on floor: what they put there. */
const HUNTER_CELLS: Partial<Record<CellCode, HunterTypeId>> = {
  [CELLS.stalker]: 'stalker',
  [CELLS.sprinter]: 'sprinter',
  [CELLS.listener]: 'listener',
};
const PICKUP_CELLS: Partial<Record<CellCode, PickupTypeId>> = {
  [CELLS.stoneBag]: 'stoneBag',
  [CELLS.heart]: 'heart',
  [CELLS.silentBoots]: 'silentBoots',
};
const EMITTER_CELLS: Partial<Record<CellCode, EmitterTypeId>> = {
  [CELLS.vent]: 'vent',
  [CELLS.drip]: 'drip',
};

export function cellId(code: CellCode): CellId {
  return CELL_OF[code];
}

/** A new map: walls all round, floor inside. */
export function emptyMap(width: number, height: number): CustomMap {
  const cells: CellCode[] = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const edge = x === 0 || y === 0 || x === width - 1 || y === height - 1;
      cells.push(edge ? CELLS.wall : CELLS.floor);
    }
  }
  return { width, height, cells };
}

/** A generated level as an editable map (its spawn, cores, beacon and surfaces). */
export function mapFromLayout(layout: MapLayout): CustomMap {
  const { tiles } = layout;
  const cells: CellCode[] = [];
  for (let ty = 0; ty < tiles.height; ty++) {
    for (let tx = 0; tx < tiles.width; tx++) {
      if (!tiles.isFloor(tx, ty)) cells.push(CELLS.wall);
      else {
        const surface = tiles.surfaceAt(
          tx * tiles.tileSize + tiles.tileSize / 2,
          ty * tiles.tileSize + tiles.tileSize / 2,
        );
        cells.push(
          surface === 'metal' ? CELLS.metal : surface === 'soft' ? CELLS.moss : CELLS.floor,
        );
      }
    }
  }
  const put = (t: TileCoord, code: CellCode) => (cells[t.ty * tiles.width + t.tx] = code);
  put(layout.spawns[0], CELLS.start);
  for (const c of layout.cores) put(c, CELLS.core);
  put(layout.beacon, CELLS.beacon);
  return { width: tiles.width, height: tiles.height, cells };
}

// ─── Text form ──────────────────────────────────────────────────────────────

export function encodeMap(map: CustomMap): string {
  let runs = '';
  for (let i = 0; i < map.cells.length;) {
    let n = 1;
    while (i + n < map.cells.length && map.cells[i + n] === map.cells[i]) n++;
    runs += (n > 1 ? String(n) : '') + map.cells[i];
    i += n;
  }
  return `${VERSION}.${map.width}x${map.height}.${runs}`;
}

/** Read a map; anything malformed, unknown or too big gives null. */
export function decodeMap(text: string): CustomMap | null {
  const m = /^v1\.(\d{1,3})x(\d{1,3})\.([0-9A-Za-z]+)$/.exec(text.trim());
  if (!m) return null;
  const width = Number(m[1]);
  const height = Number(m[2]);
  if (width < 3 || height < 3 || width > EDITOR.maxSide || height > EDITOR.maxSide) return null;
  const total = width * height;
  const cells: CellCode[] = [];
  const runs = /(\d*)([A-Za-z])/g;
  let match: RegExpExecArray | null;
  let consumed = 0;
  while ((match = runs.exec(m[3]))) {
    consumed += match[0].length;
    const n = match[1] ? Number(match[1]) : 1;
    if (!CODES.has(match[2]) || n < 1 || cells.length + n > total) return null;
    for (let k = 0; k < n; k++) cells.push(match[2] as CellCode);
  }
  if (consumed !== m[3].length || cells.length !== total) return null;
  return { width, height, cells };
}

// ─── Checking ───────────────────────────────────────────────────────────────

/**
 * What stops a map from being played, in words for the editor: one start,
 * at least one core, one beacon, a closed outer wall, everything reachable
 * from the start, and not too many cores or hunters. Empty = playable.
 */
export function mapProblems(map: CustomMap): string[] {
  const problems: string[] = [];
  const count = (code: CellCode) => map.cells.filter((c) => c === code).length;
  const starts = count(CELLS.start);
  const cores = count(CELLS.core);
  const beacons = count(CELLS.beacon);
  const hunters = map.cells.filter((c) => HUNTER_CELLS[c]).length;
  if (starts === 0) problems.push('Place a START.');
  if (starts > 1) problems.push('Only one START.');
  if (cores === 0) problems.push('Place at least one CORE.');
  if (cores > EDITOR.maxCores) problems.push(`At most ${EDITOR.maxCores} cores.`);
  if (beacons === 0) problems.push('Place a BEACON.');
  if (beacons > 1) problems.push('Only one BEACON.');
  if (hunters > EDITOR.maxHunters) problems.push(`At most ${EDITOR.maxHunters} hunters.`);
  const { width, height } = map;
  for (let i = 0; i < map.cells.length; i++) {
    const x = i % width;
    const y = Math.floor(i / width);
    const edge = x === 0 || y === 0 || x === width - 1 || y === height - 1;
    if (edge && map.cells[i] !== CELLS.wall) {
      problems.push('The outer edge must be wall.');
      break;
    }
  }
  if (starts === 1 && problems.length === 0) {
    const tiles = tileMapOf(map);
    const start = map.cells.indexOf(CELLS.start);
    const field = distanceField(tiles, [{ tx: start % width, ty: Math.floor(start / width) }]);
    const lost = map.cells.some(
      (c, i) => c !== CELLS.wall && c !== CELLS.start && field[i] === UNREACHABLE,
    );
    if (lost) problems.push('Something can’t be reached from the START.');
  }
  return problems;
}

// ─── Into a playable round ──────────────────────────────────────────────────

/** Everything a Simulation needs to play a hand-made map. */
export interface CustomRound {
  layout: MapLayout;
  /** Hunter types, in the order of layout.hunterSpawns. */
  hunters: HunterTypeId[];
  pickups: { type: PickupTypeId; at: TileCoord }[];
  emitters: { type: EmitterTypeId; at: TileCoord }[];
}

/** A playable map (check mapProblems first) as a round. Its seed comes from its text. */
export function customRound(map: CustomMap): CustomRound {
  const tiles = tileMapOf(map);
  const coordOf = (i: number): TileCoord => ({ tx: i % map.width, ty: Math.floor(i / map.width) });
  const all = (code: CellCode) => map.cells.flatMap((c, i) => (c === code ? [coordOf(i)] : []));
  const hunters: HunterTypeId[] = [];
  const hunterSpawns: TileCoord[] = [];
  const pickups: CustomRound['pickups'] = [];
  const emitters: CustomRound['emitters'] = [];
  map.cells.forEach((c, i) => {
    const hunter = HUNTER_CELLS[c];
    const pickup = PICKUP_CELLS[c];
    const emitter = EMITTER_CELLS[c];
    if (hunter) {
      hunters.push(hunter);
      hunterSpawns.push(coordOf(i));
    } else if (pickup) pickups.push({ type: pickup, at: coordOf(i) });
    else if (emitter) emitters.push({ type: emitter, at: coordOf(i) });
  });
  const layout: MapLayout = {
    seed: hashString(encodeMap(map)),
    tiles,
    rooms: [],
    spawns: all(CELLS.start),
    beacon: all(CELLS.beacon)[0],
    cores: all(CELLS.core),
    hunterSpawns,
  };
  return { layout, hunters, pickups, emitters };
}

/** The tiles: floor wherever a cell isn't wall, with metal and moss surfaces. */
function tileMapOf(map: CustomMap): TileMap {
  const tiles = new TileMap(map.width, map.height, GAME.map.tileSize);
  map.cells.forEach((c, i) => {
    if (c === CELLS.wall) return;
    const tx = i % map.width;
    const ty = Math.floor(i / map.width);
    tiles.set(tx, ty, FLOOR);
    if (c === CELLS.metal) tiles.setSurface(tx, ty, 'metal');
    if (c === CELLS.moss) tiles.setSurface(tx, ty, 'soft');
  });
  return tiles;
}
