import { GAME } from '@/config/game';
import { buildWallGeometry } from '@/sim/world/edges';
import type { MapLayout } from '@/sim/world/mapGen';
import { Simulation } from '@/sim/simulation';
import { FLOOR, TileMap, type TileCoord } from '@/sim/world/tileMap';

export const TS = GAME.map.tileSize;

/** Build a tile map from rows of '#' (wall) and '.' (floor); 'P' is floor and marks the spawn. */
export function fromAscii(rows: string[]): TileMap {
  const map = new TileMap(rows[0].length, rows.length, TS);
  rows.forEach((row, ty) =>
    [...row].forEach((c, tx) => (c === '.' || c === 'P') && map.set(tx, ty, FLOOR)),
  );
  return map;
}

function findSpawn(rows: string[]): TileCoord {
  for (let ty = 0; ty < rows.length; ty++) {
    const tx = rows[ty].indexOf('P');
    if (tx >= 0) return { tx, ty };
  }
  throw new Error('ASCII map needs a P (spawn)');
}

/** A minimal layout around hand-drawn tiles, for system tests. */
export function layoutFromAscii(rows: string[]): MapLayout {
  const spawn = findSpawn(rows);
  return {
    seed: 0,
    tiles: fromAscii(rows),
    rooms: [],
    spawns: [spawn],
    beacon: spawn,
    cores: [],
    hunterSpawns: [],
  };
}

/** A simulation on a hand-drawn map; the player starts at the center of P. */
export function simFromAscii(rows: string[]): Simulation {
  const layout = layoutFromAscii(rows);
  return new Simulation(layout, buildWallGeometry(layout.tiles));
}
