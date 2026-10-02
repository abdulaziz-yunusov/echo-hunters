import { SOUND_KINDS } from '@/config/sounds';
import { THEME, type ColorKey } from '@/config/theme';
import type { SoundWave } from '@/sim/sound/soundWave';

/** Ring opacity when it starts; it fades to 0 at full size. */
const RING_ALPHA = 0.8;
/** Band of faint color behind the ring front (world px) and its starting opacity. */
const WASH_WIDTH = 28;
const WASH_ALPHA = 0.14;

/**
 * Sound rings (GDD §4 rendering): each ring is clipped to its visibility
 * polygon, so walls cast real echo shadows. A beam draws only its wedge.
 */
export function drawWaves(
  ctx: CanvasRenderingContext2D,
  waves: readonly SoundWave[],
  /** Seconds since the last tick, to grow rings smoothly between ticks. */
  sinceTick: number,
  pixel: number,
): void {
  for (const w of waves) {
    const radius = Math.min(w.maxRadius, w.radius + w.speed * sinceTick);
    if (radius <= 0) continue;
    const progress = radius / w.maxRadius;
    const color = THEME.colors[soundColor(w)];
    const [from, to] = w.arc
      ? [w.arc.dir - w.arc.halfAngle, w.arc.dir + w.arc.halfAngle]
      : [0, Math.PI * 2];

    ctx.save();
    clipTo(ctx, w.polygon);

    // Faint wash just behind the front, so a ring stays readable in narrow corridors.
    ctx.globalAlpha = WASH_ALPHA * (1 - progress);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(w.x, w.y, radius, from, to);
    ctx.arc(w.x, w.y, Math.max(0, radius - WASH_WIDTH), to, from, true);
    ctx.fill();

    ctx.globalAlpha = RING_ALPHA * (1 - progress);
    ctx.strokeStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 6;
    ctx.lineWidth = 1.5 * pixel;
    ctx.beginPath();
    ctx.arc(w.x, w.y, radius, from, to);
    ctx.stroke();
    ctx.restore();
  }
}

/** Debug: outline of the area each wave can reach. */
export function drawWavePolygons(
  ctx: CanvasRenderingContext2D,
  waves: readonly SoundWave[],
  pixel: number,
): void {
  ctx.save();
  ctx.lineWidth = pixel;
  ctx.globalAlpha = 0.5;
  for (const w of waves) {
    ctx.strokeStyle = THEME.colors[soundColor(w)];
    ctx.beginPath();
    tracePolygon(ctx, w.polygon);
    ctx.stroke();
  }
  ctx.restore();
}

function soundColor(w: SoundWave): ColorKey {
  return SOUND_KINDS[w.kind].color;
}

function clipTo(ctx: CanvasRenderingContext2D, polygon: Float32Array): void {
  ctx.beginPath();
  tracePolygon(ctx, polygon);
  ctx.clip();
}

function tracePolygon(ctx: CanvasRenderingContext2D, p: Float32Array): void {
  if (p.length < 6) return;
  ctx.moveTo(p[0], p[1]);
  for (let i = 2; i < p.length; i += 2) ctx.lineTo(p[i], p[i + 1]);
  ctx.closePath();
}
