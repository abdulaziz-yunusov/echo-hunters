import { THEME } from '@/config/theme';

export interface TextStyle {
  /** CSS pixels. */
  size: number;
  color: string;
  align?: CanvasTextAlign;
  baseline?: CanvasTextBaseline;
  /** Glow blur radius; 0 = none. */
  glow?: number;
  alpha?: number;
}

/** Draw one line of monospace text in the game's style. Leaves ctx state unchanged. */
export function drawText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  style: TextStyle,
): void {
  ctx.save();
  ctx.font = `${style.size}px ${THEME.font}`;
  ctx.textAlign = style.align ?? 'left';
  ctx.textBaseline = style.baseline ?? 'alphabetic';
  ctx.globalAlpha = style.alpha ?? 1;
  ctx.fillStyle = style.color;
  if (style.glow) {
    ctx.shadowColor = style.color;
    ctx.shadowBlur = style.glow;
  }
  ctx.fillText(text, x, y);
  ctx.restore();
}
