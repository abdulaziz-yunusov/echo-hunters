import { THEME } from '@/config/theme';
import type { WallGeometry } from '@/sim/world/edges';
import type { MapLayout } from '@/sim/world/mapGen';
import type { TileCoord } from '@/sim/world/tileMap';

/**
 * Draws the whole map with every wall lit: the developer's view of a level
 * that players only ever see through sound. ctx must already be in world
 * pixels; `pixel` is the size of one screen pixel in world units.
 */
export function drawFullMap(
  ctx: CanvasRenderingContext2D,
  layout: MapLayout,
  geometry: WallGeometry,
  pixel: number,
  detailed: boolean,
): void {
  const { tiles } = layout;
  const baseAlpha = ctx.globalAlpha;
  const ts = tiles.tileSize;

  if (detailed) {
    ctx.fillStyle = 'rgba(191, 246, 255, 0.07)';
    for (let ty = 0; ty < tiles.height; ty++) {
      for (let tx = 0; tx < tiles.width; tx++) {
        if (tiles.isWall(tx, ty)) ctx.fillRect(tx * ts, ty * ts, ts, ts);
      }
    }
  }

  drawAllWalls(ctx, geometry, pixel);

  if (detailed) {
    // Segment endpoints: shows how edges were merged.
    ctx.fillStyle = THEME.colors.white;
    for (const s of geometry.segments) {
      ctx.fillRect(s.ax - pixel, s.ay - pixel, pixel * 2, pixel * 2);
      ctx.fillRect(s.bx - pixel, s.by - pixel, pixel * 2, pixel * 2);
    }

    ctx.fillStyle = THEME.colors.orange;
    ctx.globalAlpha = baseAlpha * 0.35;
    for (const h of layout.hunterSpawns) dot(ctx, h, ts, ts * 0.08);
    ctx.globalAlpha = baseAlpha;
  }

  ctx.strokeStyle = THEME.colors.cyan;
  ctx.lineWidth = pixel;
  ctx.setLineDash([4 * pixel, 4 * pixel]);
  for (const r of layout.rooms) ctx.strokeRect(r.x * ts, r.y * ts, r.w * ts, r.h * ts);
  ctx.setLineDash([]);

  ctx.fillStyle = THEME.colors.cyan;
  for (const c of layout.cores) diamond(ctx, c, ts, ts * 0.3);

  ctx.fillStyle = THEME.colors.green;
  dot(ctx, layout.beacon, ts, ts * 0.35);

  ctx.fillStyle = THEME.colors.white;
  for (const s of layout.spawns) dot(ctx, s, ts, ts * 0.3);
}

/** Every wall, lit, in one glowing stroke (one blur pass for the whole map). */
export function drawAllWalls(
  ctx: CanvasRenderingContext2D,
  geometry: WallGeometry,
  pixel: number,
): void {
  ctx.save();
  ctx.strokeStyle = THEME.wall;
  ctx.shadowColor = THEME.colors.cyan;
  ctx.shadowBlur = THEME.glowBlur;
  ctx.lineWidth = 1.5 * pixel;
  ctx.lineCap = 'round';
  ctx.beginPath();
  for (const s of geometry.segments) {
    ctx.moveTo(s.ax, s.ay);
    ctx.lineTo(s.bx, s.by);
  }
  ctx.stroke();
  ctx.restore();
}

function dot(ctx: CanvasRenderingContext2D, t: TileCoord, ts: number, r: number): void {
  ctx.beginPath();
  ctx.arc((t.tx + 0.5) * ts, (t.ty + 0.5) * ts, r, 0, Math.PI * 2);
  ctx.fill();
}

function diamond(ctx: CanvasRenderingContext2D, t: TileCoord, ts: number, r: number): void {
  const x = (t.tx + 0.5) * ts;
  const y = (t.ty + 0.5) * ts;
  ctx.beginPath();
  ctx.moveTo(x, y - r);
  ctx.lineTo(x + r, y);
  ctx.lineTo(x, y + r);
  ctx.lineTo(x - r, y);
  ctx.closePath();
  ctx.fill();
}
