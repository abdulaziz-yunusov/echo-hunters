import { EMITTER_TYPES } from '@/config/emitters';
import { THEME } from '@/config/theme';
import type { Emitter } from '@/sim/entities/emitter';
import { revealAlpha } from './objectRenderer';
import type { RevealMap } from './revealMap';

export const emitterKey = (e: Emitter): string => `emitter:${e.id}`;

/** Opacity of the dashed cover circle while an emitter runs (times its brightness). */
const COVER_ALPHA = 0.35;

/**
 * Vents (a slatted grille) and dripping pipes (a drop), seen when sound
 * touches them, their own noise included. While one runs, a dashed circle
 * shows the area it covers, once the player has seen it at least once.
 * `alphaOf` overrides the reveal (replays show everything).
 */
export function drawEmitters(
  ctx: CanvasRenderingContext2D,
  emitters: readonly Emitter[],
  reveal: RevealMap | null,
  now: number,
  fadeSeconds: number,
  ghostAlpha: number,
  pixel: number,
): void {
  ctx.save();
  ctx.lineWidth = 1.5 * pixel;
  ctx.strokeStyle = THEME.wall;
  ctx.fillStyle = THEME.wall;
  for (const e of emitters) {
    const seen = reveal ? reveal.objectRevealTime(emitterKey(e)) : now;
    const a = reveal ? revealAlpha(seen, now, fadeSeconds, ghostAlpha) : 0.8;
    if (seen === -Infinity) continue;

    if (e.activeLeft > 0) {
      ctx.globalAlpha = COVER_ALPHA * Math.max(a, 0.4);
      ctx.setLineDash([5 * pixel, 5 * pixel]);
      ctx.beginPath();
      ctx.arc(e.x, e.y, EMITTER_TYPES[e.type].maskRadius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    if (a <= 0) continue;
    ctx.globalAlpha = a;
    if (e.type === 'vent') {
      const s = 7;
      ctx.strokeRect(e.x - s, e.y - s, s * 2, s * 2);
      ctx.beginPath();
      for (const dy of [-3.5, 0, 3.5]) {
        ctx.moveTo(e.x - s + 2, e.y + dy);
        ctx.lineTo(e.x + s - 2, e.y + dy);
      }
      ctx.stroke();
    } else {
      // A drop: a circle with a point on top.
      ctx.beginPath();
      ctx.arc(e.x, e.y + 2, 4, 0, Math.PI);
      ctx.lineTo(e.x, e.y - 6);
      ctx.closePath();
      ctx.fill();
    }
  }
  ctx.restore();
}
