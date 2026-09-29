import { describe, expect, it } from 'vitest';
import { GAME } from '@/config/game';
import { Rng } from '@/core/rng';
import { IDLE_INPUT } from '@/sim/playerInput';
import { createSimulation, type Simulation } from '@/sim/simulation';
import { distanceField } from '@/sim/world/pathfinding';
import { DIRS4, type TileCoord } from '@/sim/world/tileMap';

const DT = 1 / 60;

/** Steer the player tile by tile along a shortest path to `target`. Returns seconds taken, or null if stuck. */
function walkTo(sim: Simulation, target: TileCoord): number | null {
  const { tiles } = sim.state.layout;
  const toTarget = distanceField(tiles, [target]);
  const p = sim.state.player;
  let tile = { tx: tiles.toTile(p.x), ty: tiles.toTile(p.y) };
  const pathTiles = toTarget[tiles.index(tile.tx, tile.ty)];
  const limit = ((pathTiles * tiles.tileSize) / GAME.player.speed) * 2 + 1;

  for (let t = 0; t < limit; t += DT) {
    const here = toTarget[tiles.index(tile.tx, tile.ty)];
    let next = tile;
    if (here > 0) {
      for (const [dx, dy] of DIRS4) {
        const n = { tx: tile.tx + dx, ty: tile.ty + dy };
        if (tiles.isFloor(n.tx, n.ty) && toTarget[tiles.index(n.tx, n.ty)] === here - 1) next = n;
      }
    }
    const goal = tiles.center(next);
    const dx = goal.x - p.x;
    const dy = goal.y - p.y;
    const d = Math.hypot(dx, dy);
    if (here === 0 && d < 2) return t;
    if (d < 2) tile = next;
    sim.step({ ...IDLE_INPUT, moveX: d > 0 ? dx / d : 0, moveY: d > 0 ? dy / d : 0 }, DT);
  }
  return null;
}

describe('walking the generated maze', () => {
  it.each([0, 1, 2, 3, 4, 5, 6, 7])('seed %i: spawn → every core → beacon', (seed) => {
    const sim = createSimulation(seed);
    const { cores, beacon } = sim.state.layout;
    for (const target of [...cores, beacon]) {
      expect(walkTo(sim, target), `stuck on the way to ${target.tx},${target.ty}`).not.toBeNull();
    }
  });

  it('random input for 2 minutes never lets the player overlap a wall', () => {
    const sim = createSimulation(123);
    const rng = new Rng(9);
    const { tiles } = sim.state.layout;
    const p = sim.state.player;
    let input = { ...IDLE_INPUT };
    for (let tick = 0; tick < 120 * 60; tick++) {
      if (tick % 20 === 0) {
        input = {
          ...IDLE_INPUT,
          moveX: rng.pick([-1, 0, 1, 0.5]),
          moveY: rng.pick([-1, 0, 1, -0.5]),
          sneak: rng.chance(0.2),
        };
      }
      sim.step(input, DT);

      // No wall tile may come closer to the center than the radius.
      const ts = tiles.tileSize;
      for (let ty = tiles.toTile(p.y - p.radius); ty <= tiles.toTile(p.y + p.radius); ty++) {
        for (let tx = tiles.toTile(p.x - p.radius); tx <= tiles.toTile(p.x + p.radius); tx++) {
          if (!tiles.isWall(tx, ty)) continue;
          const cx = Math.min(Math.max(p.x, tx * ts), (tx + 1) * ts);
          const cy = Math.min(Math.max(p.y, ty * ts), (ty + 1) * ts);
          expect(Math.hypot(p.x - cx, p.y - cy)).toBeGreaterThan(p.radius - 1e-6);
        }
      }
    }
  });
});
