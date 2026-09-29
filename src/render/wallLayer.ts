import { THEME } from '@/config/theme';
import type { Bounds } from '@/core/geometry';
import type { WallGeometry } from '@/sim/world/edges';
import type { RevealMap } from './revealMap';

/** Brightness levels. Each costs one glow pass per frame, instead of one per wall edge. */
const BUCKETS = 8;

/**
 * Draws walls that sound has revealed: bright when touched, fading over
 * `fadeSeconds` to the difficulty's ghost level (GDD §4 memory ghosting).
 */
export class WallLayer {
  private readonly walls: WallGeometry;
  private readonly buckets: number[][] = Array.from({ length: BUCKETS }, () => []);
  private readonly ghost: number[] = [];
  private readonly visible: number[] = [];

  constructor(walls: WallGeometry) {
    this.walls = walls;
  }

  draw(
    ctx: CanvasRenderingContext2D,
    reveal: RevealMap,
    now: number,
    view: Bounds,
    pixel: number,
    fadeSeconds: number,
    ghostAlpha: number,
  ): void {
    this.visible.length = 0;
    this.ghost.length = 0;
    for (const b of this.buckets) b.length = 0;

    for (const id of this.walls.edgeGrid.query(view, this.visible)) {
      const at = reveal.revealTime[id];
      if (at === -Infinity) continue;
      const alpha = 1 - (now - at) / fadeSeconds;
      if (alpha <= ghostAlpha) {
        if (ghostAlpha > 0) this.ghost.push(id);
        continue;
      }
      this.buckets[Math.min(BUCKETS - 1, Math.floor(alpha * BUCKETS))].push(id);
    }

    ctx.save();
    ctx.strokeStyle = THEME.wall;
    ctx.lineWidth = 2 * pixel;
    ctx.lineCap = 'round';

    // Remembered walls: faint, no glow (cheap).
    if (this.ghost.length > 0) {
      ctx.globalAlpha = ghostAlpha;
      this.stroke(ctx, this.ghost);
    }

    ctx.shadowColor = THEME.colors.cyan;
    ctx.shadowBlur = THEME.glowBlur;
    this.buckets.forEach((ids, level) => {
      if (ids.length === 0) return;
      ctx.globalAlpha = (level + 1) / BUCKETS;
      this.stroke(ctx, ids);
    });
    ctx.restore();
  }

  private stroke(ctx: CanvasRenderingContext2D, ids: readonly number[]): void {
    ctx.beginPath();
    for (const id of ids) {
      const e = this.walls.edges[id];
      ctx.moveTo(e.ax, e.ay);
      ctx.lineTo(e.bx, e.by);
    }
    ctx.stroke();
  }
}
