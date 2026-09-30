import { EMITTER_PLACEMENT, EMITTER_TYPES, type EmitterTypeId } from '@/config/emitters';
import { deriveSeed, Rng } from '@/core/rng';
import type { Emitter } from '../entities/emitter';
import type { MapLayout } from './mapGen';
import { distanceField } from './pathfinding';
import { DIRS4, type TileCoord } from './tileMap';

/**
 * Put the level's vents and pipes on the map. Deterministic from the map
 * seed (own stream), so both duel players get the same ones, cycling in
 * step. They go on corridor tiles (two open sides) away from the spawns,
 * spaced apart, never on a core, the beacon or a pickup tile (`taken`).
 * Each starts its cycle at a random point, so they don't all pulse together.
 */
export function placeEmitters(
  layout: MapLayout,
  counts: Partial<Record<EmitterTypeId, number>>,
  taken: readonly TileCoord[] = [],
): Emitter[] {
  const { tiles } = layout;
  const cfg = EMITTER_PLACEMENT;
  const rng = new Rng(deriveSeed(layout.seed, 'emitters'));
  const fromSpawn = distanceField(tiles, layout.spawns);
  const blocked = new Set(
    [layout.beacon, ...layout.cores, ...taken].map((t) => tiles.index(t.tx, t.ty)),
  );

  const candidates: number[] = [];
  for (let i = 0; i < tiles.tiles.length; i++) {
    const { tx, ty } = tiles.coordOf(i);
    if (!tiles.isFloor(tx, ty) || blocked.has(i) || fromSpawn[i] < cfg.minFromSpawn) continue;
    const open = DIRS4.filter(([dx, dy]) => tiles.isFloor(tx + dx, ty + dy)).length;
    if (open === 2) candidates.push(i);
  }
  rng.shuffle(candidates);

  const emitters: Emitter[] = [];
  const chosen: TileCoord[] = [];
  const types = (Object.entries(counts) as [EmitterTypeId, number][]).filter(([, n]) => n > 0);
  for (const [type, count] of types) {
    for (let n = 0; n < count; n++) {
      // Spacing by walking distance from the ones already placed.
      const spacing = chosen.length > 0 ? distanceField(tiles, chosen) : null;
      const index = candidates.findIndex((i) => !spacing || spacing[i] >= cfg.minSpacing);
      if (index < 0) break;
      const [tile] = candidates.splice(index, 1);
      const coord = tiles.coordOf(tile);
      chosen.push(coord);
      const at = tiles.center(coord);
      const def = EMITTER_TYPES[type];
      emitters.push({
        id: emitters.length + 1,
        type,
        x: at.x,
        y: at.y,
        timer: rng.range(0, def.period),
        activeLeft: 0,
      });
    }
  }
  return emitters;
}
