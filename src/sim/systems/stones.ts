import { GAME } from '@/config/game';
import type { SimContext } from '../gameState';
import { moveCircle } from '../world/collision';

/**
 * Fly decoy stones. A stone lands at its aim point, or earlier if it hits
 * a wall, and only then makes a sound: a fake ping that draws hunters there.
 */
export function updateStones(ctx: SimContext, dt: number): void {
  const { state } = ctx;
  const { radius } = GAME.abilities.stone;
  const flying = [];

  for (const stone of state.stones) {
    stone.prevX = stone.x;
    stone.prevY = stone.y;
    const t = Math.min(dt, stone.timeLeft);
    const moved = moveCircle(
      state.layout.tiles,
      stone.x,
      stone.y,
      radius,
      stone.vx * t,
      stone.vy * t,
    );
    stone.x = moved.x;
    stone.y = moved.y;
    stone.timeLeft -= t;

    if (moved.hit || stone.timeLeft <= 0) {
      ctx.emitSound('stoneImpact', stone.x, stone.y, stone.owner);
    } else {
      flying.push(stone);
    }
  }
  state.stones = flying;
}
