import type { SurfaceId } from '@/config/surfaces';
import { THEME } from '@/config/theme';
import type { TileMap } from '@/sim/world/tileMap';

/** A floor tile that is not plain floor, with the key sound reveals it by. */
export interface SurfaceTile {
  key: string;
  surface: Exclude<SurfaceId, 'normal'>;
  /** Tile's top-left corner and center (world px). */
  left: number;
  top: number;
  x: number;
  y: number;
  /** Stable per tile, for the moss pattern. */
  index: number;
}

/** Floors are quieter than walls: at most this bright. */
const FLOOR_ALPHA = 0.55;

/** Every metal and moss tile of a map (plain floor is never drawn). */
export function listSurfaceTiles(tiles: TileMap): SurfaceTile[] {
  const result: SurfaceTile[] = [];
  const ts = tiles.tileSize;
  for (let i = 0; i < tiles.surfaces.length; i++) {
    const { tx, ty } = tiles.coordOf(i);
    const surface = tiles.surface(tx, ty);
    if (surface === 'normal' || !tiles.isFloor(tx, ty)) continue;
    result.push({
      key: `floor:${i}`,
      surface,
      left: tx * ts,
      top: ty * ts,
      x: (tx + 0.5) * ts,
      y: (ty + 0.5) * ts,
      index: i,
    });
  }
  return result;
}

/**
 * Metal grates (bars in a frame) and moss (a scatter of dots), at the
 * brightness `alphaOf` gives each tile: revealed by sound in play, always
 * on in replays and debug views. Told apart by pattern, not only color.
 */
export function drawSurfaces(
  ctx: CanvasRenderingContext2D,
  surfaces: readonly SurfaceTile[],
  tileSize: number,
  pixel: number,
  alphaOf: (s: SurfaceTile) => number,
): void {
  const inset = tileSize * 0.14;
  const size = tileSize - inset * 2;
  ctx.save();
  ctx.lineWidth = pixel;
  for (const s of surfaces) {
    const a = alphaOf(s) * FLOOR_ALPHA;
    if (a <= 0.01) continue;
    ctx.globalAlpha = a;
    const x = s.left + inset;
    const y = s.top + inset;
    if (s.surface === 'metal') {
      ctx.strokeStyle = THEME.surfaces.metal;
      ctx.strokeRect(x, y, size, size);
      ctx.beginPath();
      for (let k = 1; k <= 3; k++) {
        const bx = x + (size * k) / 4;
        ctx.moveTo(bx, y);
        ctx.lineTo(bx, y + size);
      }
      ctx.stroke();
    } else {
      ctx.fillStyle = THEME.surfaces.soft;
      for (let k = 0; k < 6; k++) {
        // Fixed per tile, so the pattern never flickers.
        const fx = fract(Math.sin(s.index * 12.9898 + k * 78.233) * 43758.5453);
        const fy = fract(Math.sin(s.index * 39.3468 + k * 11.135) * 24634.6345);
        ctx.beginPath();
        ctx.arc(x + fx * size, y + fy * size, 1.6, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  ctx.restore();
}

function fract(v: number): number {
  return v - Math.floor(v);
}
