import { GAME } from '@/config/game';
import type { Player } from '../entities/player';
import type { SimContext } from '../gameState';
import { canUse, take } from './duel';

/**
 * Walk over a pickup to use it (GDD §5). A heart waits on the floor while
 * HP is full. The effect is applied when the pickup is granted (duel.ts).
 */
export function updatePickups(ctx: SimContext, player: Player, dt: number): void {
  player.silentTime = Math.max(0, player.silentTime - dt);
  const reach = GAME.objectives.pickupRadius + player.radius;

  for (const p of ctx.state.pickups) {
    if (p.collected || !canUse(player, p)) continue;
    if (Math.hypot(player.x - p.x, player.y - p.y) > reach) continue;
    take(ctx, 'pickup', p.id);
  }
}
