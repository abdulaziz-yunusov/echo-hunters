import { GAME } from '@/config/game';
import { THEME } from '@/config/theme';
import type { Vec2 } from '@/core/geometry';
import type { Player } from '@/sim/entities/player';
import type { Stone } from '@/sim/entities/stone';

/** The player: always visible to yourself, a white dot with a faint aura (GDD §9). */
export function drawPlayer(
  ctx: CanvasRenderingContext2D,
  player: Player,
  alpha: number,
  /** In sound cover (Phase 17): drawn dimmer, like sneaking, since steps are silent. */
  masked = false,
): void {
  const { x, y } = playerDrawPosition(player, alpha);
  const auraRadius = THEME.player.auraRadius;

  const aura = ctx.createRadialGradient(x, y, 0, x, y, auraRadius);
  aura.addColorStop(0, 'rgba(255, 255, 255, 0.25)');
  aura.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = aura;
  ctx.beginPath();
  ctx.arc(x, y, auraRadius, 0, Math.PI * 2);
  ctx.fill();

  // Sneaking dims the dot a little, so the player can see they are silent;
  // after a hit it blinks while the player cannot be hurt.
  const blink = player.invulnerable > 0 && Math.floor(player.invulnerable * 12) % 2 === 0;
  ctx.globalAlpha = blink ? 0.25 : player.sneaking || masked ? 0.6 : 1;
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

/** Decoy stones in flight: a faint dot only the thrower sees (it reveals nothing). */
export function drawStones(
  ctx: CanvasRenderingContext2D,
  stones: readonly Stone[],
  alpha: number,
): void {
  ctx.save();
  ctx.fillStyle = THEME.colors.white;
  ctx.globalAlpha = 0.7;
  for (const s of stones) {
    ctx.beginPath();
    ctx.arc(
      s.prevX + (s.x - s.prevX) * alpha,
      s.prevY + (s.y - s.prevY) * alpha,
      GAME.abilities.stone.radius,
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }
  ctx.restore();
}

/** Where a stone would land: the aim point, pulled in to the throw range. */
export function drawAimReticle(
  ctx: CanvasRenderingContext2D,
  from: Vec2,
  aim: Vec2,
  pixel: number,
): void {
  const range = GAME.abilities.stone.throwRange;
  const dx = aim.x - from.x;
  const dy = aim.y - from.y;
  const length = Math.hypot(dx, dy);
  if (length < 1) return;
  const d = Math.min(length, range);
  const x = from.x + (dx / length) * d;
  const y = from.y + (dy / length) * d;
  const r = 5;
  ctx.save();
  ctx.strokeStyle = THEME.colors.white;
  ctx.globalAlpha = 0.35;
  ctx.lineWidth = pixel;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.moveTo(x - r - 3, y);
  ctx.lineTo(x - r + 2, y);
  ctx.moveTo(x + r - 2, y);
  ctx.lineTo(x + r + 3, y);
  ctx.stroke();
  ctx.restore();
}

export const RIVAL_KEY = 'rival';

/**
 * The duel rival is never drawn directly (GDD §8), only as a pale outline
 * where one of *your* sounds touched them, fading like a hunter's silhouette.
 */
export function drawRivalOutline(
  ctx: CanvasRenderingContext2D,
  seen: { time: number; x: number; y: number } | undefined,
  now: number,
  fadeSeconds: number,
  pixel: number,
): void {
  if (!seen) return;
  const a = 1 - (now - seen.time) / fadeSeconds;
  if (a <= 0) return;
  ctx.save();
  ctx.globalAlpha = a;
  ctx.strokeStyle = THEME.colors.white;
  ctx.shadowColor = THEME.colors.white;
  ctx.shadowBlur = THEME.glowBlur;
  ctx.lineWidth = 2 * pixel;
  ctx.beginPath();
  ctx.arc(seen.x, seen.y, GAME.player.radius + 3, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}
