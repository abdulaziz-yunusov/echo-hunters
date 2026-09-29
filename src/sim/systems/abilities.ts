import { GAME } from '@/config/game';
import type { Player } from '../entities/player';
import type { SimContext } from '../gameState';
import type { PlayerInput } from '../playerInput';

/** Sonar ping (GDD §3–4). Decoy stones and shockwave join in Phase 7. */
export function updateAbilities(
  ctx: SimContext,
  player: Player,
  input: PlayerInput,
  dt: number,
): void {
  player.pingCooldown = Math.max(0, player.pingCooldown - dt);
  if (input.ping && player.pingCooldown === 0) {
    ctx.emitSound('ping', player.x, player.y, player.id);
    player.pingCooldown = GAME.abilities.ping.cooldown;
    player.pingsUsed++;
  }
}
