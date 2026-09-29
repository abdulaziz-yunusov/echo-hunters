import type { HunterTypeId } from '@/config/hunters';
import { THEME } from '@/config/theme';
import type { Hunter } from '@/sim/entities/hunter';
import type { RevealMap } from './revealMap';
import { drawText } from './text';

export const hunterKey = (h: Hunter): string => `hunter:${h.id}`;

/**
 * Jagged red silhouettes (GDD §9), drawn where a ring last touched each
 * hunter, fading fast. They do not follow the hunter: you only know where
 * it *was*.
 */
export function drawHunterSilhouettes(
  ctx: CanvasRenderingContext2D,
  hunters: readonly Hunter[],
  reveal: RevealMap,
  now: number,
  fadeSeconds: number,
): void {
  ctx.save();
  ctx.fillStyle = THEME.hunterSilhouette;
  ctx.shadowColor = THEME.hunterSilhouette;
  ctx.shadowBlur = THEME.glowBlur;
  for (const h of hunters) {
    const seen = reveal.objectReveal(hunterKey(h));
    if (!seen) continue;
    const a = 1 - (now - seen.time) / fadeSeconds;
    if (a <= 0) continue;
    ctx.globalAlpha = a;
    jagged(ctx, seen.x, seen.y, h.type, h.id);
    ctx.fill();
  }
  ctx.restore();
}

/** Debug: every hunter's real position, state, path and the last sound it heard. */
export function drawHunterDebug(
  ctx: CanvasRenderingContext2D,
  hunters: readonly Hunter[],
  alpha: number,
  pixel: number,
): void {
  ctx.save();
  ctx.lineWidth = pixel;
  for (const h of hunters) {
    const x = h.prevX + (h.x - h.prevX) * alpha;
    const y = h.prevY + (h.y - h.prevY) * alpha;

    if (h.path.length > 0) {
      ctx.strokeStyle = THEME.colors.orange;
      ctx.globalAlpha = 0.6;
      ctx.setLineDash([3 * pixel, 3 * pixel]);
      ctx.beginPath();
      ctx.moveTo(x, y);
      for (const p of h.path) ctx.lineTo(p.x, p.y);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    if (h.lastHeard) {
      ctx.strokeStyle = THEME.colors.red;
      ctx.globalAlpha = 0.8;
      const s = 5;
      ctx.beginPath();
      ctx.moveTo(h.lastHeard.x - s, h.lastHeard.y - s);
      ctx.lineTo(h.lastHeard.x + s, h.lastHeard.y + s);
      ctx.moveTo(h.lastHeard.x + s, h.lastHeard.y - s);
      ctx.lineTo(h.lastHeard.x - s, h.lastHeard.y + s);
      ctx.stroke();
    }

    ctx.globalAlpha = 1;
    ctx.strokeStyle = THEME.colors.red;
    ctx.beginPath();
    ctx.arc(x, y, h.radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.save();
    ctx.translate(x, y - h.radius - 4 * pixel);
    ctx.scale(pixel, pixel);
    drawText(ctx, `${h.type} ${h.state}`, 0, 0, {
      size: 11,
      color: THEME.colors.orange,
      align: 'center',
    });
    ctx.restore();
  }
  ctx.restore();
}

/** A hunter type's silhouette on its own (menus, how-to-play), at `scale`. */
export function drawHunterShape(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  type: HunterTypeId,
  scale = 1,
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.fillStyle = THEME.hunterSilhouette;
  ctx.shadowColor = THEME.hunterSilhouette;
  ctx.shadowBlur = THEME.glowBlur;
  jagged(ctx, 0, 0, type, 1);
  ctx.fill();
  ctx.restore();
}

/**
 * A spiky outline shaped by the hunter's type. The small wobble is fixed per
 * hunter (`seed`), so each one looks the same every time it is seen.
 */
function jagged(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  type: HunterTypeId,
  seed: number,
): void {
  const { spikes, outer, inner } = THEME.hunterShapes[type];
  ctx.beginPath();
  for (let i = 0; i < spikes * 2; i++) {
    const angle = (i / (spikes * 2)) * Math.PI * 2;
    const wobble = ((Math.sin(seed * 12.9898 + i * 78.233) * 43758.5453) % 1) * 3;
    const r = (i % 2 === 0 ? outer : inner) + wobble;
    const px = x + Math.cos(angle) * r;
    const py = y + Math.sin(angle) * r;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}
