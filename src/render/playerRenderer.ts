import { THEME } from '@/config/theme';
import type { Player } from '@/sim/entities/player';

/** The player: always visible to yourself, a white dot with a faint aura (GDD §9). */
export function drawPlayer(ctx: CanvasRenderingContext2D, player: Player, alpha: number): void {
  const { x, y } = playerDrawPosition(player, alpha);
  const auraRadius = THEME.player.auraRadius;

  const aura = ctx.createRadialGradient(x, y, 0, x, y, auraRadius);
  aura.addColorStop(0, 'rgba(255, 255, 255, 0.25)');
  aura.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = aura;
  ctx.beginPath();
  ctx.arc(x, y, auraRadius, 0, Math.PI * 2);
  ctx.fill();

  // Sneaking dims the dot a little, so the player can see they are silent.
  ctx.globalAlpha = player.sneaking ? 0.6 : 1;
  ctx.fillStyle = THEME.player.color;
  ctx.beginPath();
  ctx.arc(x, y, player.radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
}

/** Interpolated player position, for the camera. */
export function playerDrawPosition(player: Player, alpha: number): { x: number; y: number } {
  return {
    x: player.prevX + (player.x - player.prevX) * alpha,
    y: player.prevY + (player.y - player.prevY) * alpha,
  };
}
