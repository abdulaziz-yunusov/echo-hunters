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

/**
 * Break text into lines no wider than maxWidth (measured with the context's
 * current font), at spaces. A single word wider than that gets a line alone.
 */
export function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(' ')) {
    const next = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(next).width > maxWidth) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}
