import { GAME } from '@/config/game';
import { buildWallGeometry } from '@/sim/world/edges';
import type { MapLayout } from '@/sim/world/mapGen';
import { Simulation, type SimulationOptions } from '@/sim/simulation';
import { FLOOR, TileMap, type TileCoord } from '@/sim/world/tileMap';

export const TS = GAME.map.tileSize;

/** Where the beacon goes when a test map has no B: far off the map, never reachable. */
const NO_BEACON: TileCoord = { tx: -100, ty: -100 };

/**
 * Build a tile map from rows of characters:
 * '#' wall, '.' floor, 'P' player spawn, 'C' Signal Core, 'B' beacon, 'H' hunter spawn
 * (all on floor).
 */
export function fromAscii(rows: string[]): TileMap {
  const map = new TileMap(rows[0].length, rows.length, TS);
  rows.forEach((row, ty) => [...row].forEach((c, tx) => c !== '#' && map.set(tx, ty, FLOOR)));
  return map;
}

function find(rows: string[], char: string): TileCoord[] {
  const found: TileCoord[] = [];
  rows.forEach((row, ty) =>
    [...row].forEach((c, tx) => {
      if (c === char) found.push({ tx, ty });
    }),
  );
  return found;
}

/** A minimal layout around hand-drawn tiles, for system tests. */
export function layoutFromAscii(rows: string[]): MapLayout {
  const [spawn] = find(rows, 'P');
  if (!spawn) throw new Error('ASCII map needs a P (spawn)');
  return {
    seed: 0,
    tiles: fromAscii(rows),
    rooms: [],
    spawns: [spawn],
    beacon: find(rows, 'B')[0] ?? NO_BEACON,
    cores: find(rows, 'C'),
    hunterSpawns: find(rows, 'H'),
  };
}

/**
 * A simulation on a hand-drawn map; the player starts at the center of P.
 * Hunters spawn only on H tiles (level 1's Stalker unless `options.hunters` says otherwise).
 */
export function simFromAscii(rows: string[], options: SimulationOptions = {}): Simulation {
  const layout = layoutFromAscii(rows);
  // No random pickups on hand-drawn maps unless a test asks for them.
  return new Simulation(layout, buildWallGeometry(layout.tiles), { pickups: {}, ...options });
}
