import { GAME } from '@/config/game';
import { PICKUP_TYPES } from '@/config/pickups';
import type { Pickup } from '../entities/pickup';
import type { Player } from '../entities/player';
import type { SimContext } from '../gameState';

/** Walk over a pickup to use it (GDD §5). A heart waits on the floor while HP is full. */
export function updatePickups(ctx: SimContext, player: Player, dt: number): void {
  player.silentTime = Math.max(0, player.silentTime - dt);
  const reach = GAME.objectives.pickupRadius + player.radius;

  for (const p of ctx.state.pickups) {
    if (p.collected) continue;
    if (Math.hypot(player.x - p.x, player.y - p.y) > reach) continue;
    if (!apply(player, p)) continue;
    p.collected = true;
    ctx.events.emit('pickupCollected', { pickupId: p.id, type: p.type, x: p.x, y: p.y });
  }
}

/** Give the pickup's effect. Returns false if it would be wasted (then it stays). */
function apply(player: Player, p: Pickup): boolean {
  switch (p.type) {
    case 'stoneBag':
      player.stones += PICKUP_TYPES.stoneBag.stones;
      return true;
    case 'heart':
      if (player.hp >= player.maxHp) return false;
      player.hp = Math.min(player.maxHp, player.hp + PICKUP_TYPES.heart.hp);
      return true;
    case 'silentBoots':
      player.silentTime = PICKUP_TYPES.silentBoots.duration;
      return true;
  }
}
