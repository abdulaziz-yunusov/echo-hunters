import { GAME } from '@/config/game';
import type { LevelDef } from '@/config/levels';
import { DUEL_TOOLS, type PickupTypeId } from '@/config/pickups';
import { deriveSeed, Rng } from '@/core/rng';
import type { Pickup } from '../entities/pickup';
import type { MapLayout } from './mapGen';
import { distanceField } from './pathfinding';

/**
 * Put the level's pickups on the map. Deterministic: depends only on the
 * map and the level, so both duel players get the same pickups.
 * Pickups go on free floor tiles away from the spawns, never on a core,
 * the beacon or another pickup.
 */
/**
 * A duel map's pickups (Phase 29): GAME.duel.pickups, plus
 * GAME.duel.toolsPerMap tools picked by the seed (its own stream), so both
 * players get the same ones.
 */
export function duelPickupCounts(seed: number): LevelDef['pickups'] {
  const tools = new Rng(deriveSeed(seed, 'tools')).shuffle([...DUEL_TOOLS]);
  const counts: LevelDef['pickups'] = { ...GAME.duel.pickups };
  for (const tool of tools.slice(0, GAME.duel.toolsPerMap)) counts[tool] = 1;
  return counts;
}

export function placePickups(layout: MapLayout, counts: LevelDef['pickups']): Pickup[] {
  const { tiles } = layout;
  const rng = new Rng(deriveSeed(layout.seed, 'pickups'));
  const fromSpawn = distanceField(tiles, layout.spawns);
  const taken = new Set([layout.beacon, ...layout.cores].map((t) => tiles.index(t.tx, t.ty)));

  const free: number[] = [];
  for (let i = 0; i < tiles.tiles.length; i++) {
    if (fromSpawn[i] >= GAME.objectives.pickupMinTilesFromSpawn && !taken.has(i)) free.push(i);
  }
  rng.shuffle(free);

  const pickups: Pickup[] = [];
  const types = Object.entries(counts) as [PickupTypeId, number][];
  for (const [type, count] of types) {
    for (let n = 0; n < count && free.length > 0; n++) {
      const at = tiles.center(tiles.coordOf(free.pop()!));
      pickups.push({ id: pickups.length + 1, type, x: at.x, y: at.y, collected: false });
    }
  }
  return pickups;
}
