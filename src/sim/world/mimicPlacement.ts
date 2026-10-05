import { GAME } from '@/config/game';
import type { HunterTypeId } from '@/config/hunters';
import type { Rect } from '@/core/geometry';
import { deriveSeed, Rng } from '@/core/rng';
import type { MapLayout } from './mapGen';
import type { TileCoord } from './tileMap';

export interface HunterPlacement {
  type: HunterTypeId;
  at: TileCoord;
  /** Mimic: seconds until its first hum (0 for the others). */
  humIn: number;
}

const key = (t: TileCoord) => `${t.tx},${t.ty}`;
const inRoom = (r: Rect, t: TileCoord) =>
  t.tx >= r.x && t.tx < r.x + r.w && t.ty >= r.y && t.ty < r.y + r.h;
const roomCenter = (r: Rect): TileCoord => ({ tx: r.x + (r.w - 1) / 2, ty: r.y + (r.h - 1) / 2 });

/**
 * Where each hunter starts: the map's hunter spawns, in order, except for
 * Mimics (Phase 19c). A Mimic takes the center of a room with no core, where
 * a core would be, if one is free; else a free spawn tile in any room; else
 * its own spawn (hand-made maps have no rooms: it stays where it was put).
 * Only spawn tiles qualify, so it is as far from the players as any hunter.
 * Its own stream, so maps without Mimics are unchanged.
 */
export function placeMimics(layout: MapLayout, types: readonly HunterTypeId[]): HunterPlacement[] {
  const placed = types.map((type, i) => ({ type, at: layout.hunterSpawns[i], humIn: 0 }));
  if (!types.includes('mimic')) return placed;

  const rng = new Rng(deriveSeed(layout.seed, 'mimics'));
  const allowed = new Set(layout.hunterSpawns.map(key));
  const used = new Set(placed.filter((h) => h.type !== 'mimic').map((h) => key(h.at)));
  const free = (t: TileCoord) => allowed.has(key(t)) && !used.has(key(t));
  const coreless = layout.rooms.filter((r) => !layout.cores.some((c) => inRoom(r, c)));
  const centers = rng.shuffle(coreless.map(roomCenter));
  const roomTiles = rng.shuffle(
    layout.hunterSpawns.filter((t) => layout.rooms.some((r) => inRoom(r, t))),
  );

  for (const h of placed) {
    if (h.type !== 'mimic') continue;
    const spot = centers.find(free) ?? roomTiles.find(free);
    if (spot) h.at = spot;
    used.add(key(h.at));
    h.humIn = rng.range(0, GAME.objectives.coreHumInterval);
  }
  return placed;
}
