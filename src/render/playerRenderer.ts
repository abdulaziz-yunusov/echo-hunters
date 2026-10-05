import { GAME } from '@/config/game';
import { THEME } from '@/config/theme';
import type { Vec2 } from '@/core/geometry';
import { beamCharged, type Player } from '@/sim/entities/player';
import type { Stone } from '@/sim/entities/stone';
import { arcHalfAngle } from '@/sim/sound/soundWave';

/** How far out the charged beam's aim guide reaches (world px). */
const BEAM_GUIDE_LENGTH = 70;

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

/** Aim guide at the pointer: a charged beam's wedge, else where a stone would land. */
export function drawAimGuide(
  ctx: CanvasRenderingContext2D,
  player: Player,
  from: Vec2,
  aim: Vec2,
  pixel: number,
): void {
  const dx = aim.x - from.x;
  const dy = aim.y - from.y;
  const length = Math.hypot(dx, dy);
  if (length < 1) return;
  ctx.save();
  ctx.lineWidth = pixel;
  ctx.beginPath();
  if (beamCharged(player)) {
    // The beam's edges, a short way out.
    const dir = Math.atan2(dy, dx);
    const half = arcHalfAngle('pingBeam') ?? 0;
    const r = BEAM_GUIDE_LENGTH;
    ctx.strokeStyle = THEME.colors.cyan;
    ctx.globalAlpha = 0.5;
    ctx.moveTo(from.x + Math.cos(dir - half) * r, from.y + Math.sin(dir - half) * r);
    ctx.lineTo(from.x, from.y);
    ctx.lineTo(from.x + Math.cos(dir + half) * r, from.y + Math.sin(dir + half) * r);
    ctx.arc(from.x, from.y, r, dir + half, dir - half, true);
  } else if (player.stones > 0) {
    const d = Math.min(length, GAME.abilities.stone.throwRange);
    const x = from.x + (dx / length) * d;
    const y = from.y + (dy / length) * d;
    const r = 5;
    ctx.strokeStyle = THEME.colors.white;
    ctx.globalAlpha = 0.35;
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.moveTo(x - r - 3, y);
    ctx.lineTo(x - r + 2, y);
    ctx.moveTo(x + r - 2, y);
    ctx.lineTo(x + r + 3, y);
  }
  ctx.stroke();
  ctx.restore();
}

export const RIVAL_KEY = 'rival';

/**
 * The duel rival is never drawn directly (GDD §8), only as a pale outline
 * where one of *your* sounds touched them, fading like a hunter's silhouette.
 */
/** Your own duel traps (Phase 29): a faint red cross where each waits. The rival's are never drawn. */
export function drawTraps(
  ctx: CanvasRenderingContext2D,
  traps: readonly { owner: number; x: number; y: number }[],
  me: number,
  pixel: number,
): void {
  ctx.save();
  ctx.strokeStyle = THEME.colors.red;
  ctx.globalAlpha = 0.55;
  ctx.lineWidth = 1.5 * pixel;
  const r = 5;
  for (const t of traps) {
    if (t.owner !== me) continue;
    ctx.beginPath();
    ctx.moveTo(t.x - r, t.y - r);
    ctx.lineTo(t.x + r, t.y + r);
    ctx.moveTo(t.x + r, t.y - r);
    ctx.lineTo(t.x - r, t.y + r);
    ctx.stroke();
  }
  ctx.restore();
}

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

export const GHOST_KEY = 'ghost';

/**
 * The echo of your best run (Phase 23): a pale, dashed ring where a sound
 * ring last passed over it, fading like a hunter's silhouette. It never
 * shows where nothing was heard, so the darkness stays dark.
 */
export function drawGhost(
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
  ctx.globalAlpha = a * 0.55;
  ctx.strokeStyle = THEME.colors.white;
  ctx.fillStyle = THEME.colors.white;
  ctx.lineWidth = 1.5 * pixel;
  ctx.setLineDash([3 * pixel, 3 * pixel]);
  ctx.beginPath();
  ctx.arc(seen.x, seen.y, GAME.player.radius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = a * 0.35;
  ctx.beginPath();
  ctx.arc(seen.x, seen.y, GAME.player.radius * 0.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}
