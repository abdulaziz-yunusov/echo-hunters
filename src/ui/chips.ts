import { THEME } from '@/config/theme';
import { drawText } from '@/render/text';

export interface Chip {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A row of chips that wraps onto more rows to stay within `maxWidth` (CSS px). */
export function flowChips(
  widths: readonly number[],
  left: number,
  top: number,
  maxWidth: number,
  height = 28,
  gap = 6,
): Chip[] {
  const chips: Chip[] = [];
  let x = left;
  let y = top;
  for (const w of widths) {
    if (x > left && x + w > left + maxWidth) {
      x = left;
      y += height + gap;
    }
    chips.push({ x, y, w, h: height });
    x += w + gap;
  }
  return chips;
}

/** The chip under (x, y), or -1. */
export function chipAt(chips: readonly Chip[], x: number, y: number): number {
  return chips.findIndex((c) => x >= c.x && x <= c.x + c.w && y >= c.y && y <= c.y + c.h);
}

/** Bottom edge of the last row. */
export function chipsBottom(chips: readonly Chip[]): number {
  return chips.reduce((b, c) => Math.max(b, c.y + c.h), 0);
}

/** An outlined chip with a centered label. */
export function drawChip(
  ctx: CanvasRenderingContext2D,
  chip: Chip,
  label: string,
  style: { color: string; selected?: boolean; disabled?: boolean },
): void {
  ctx.save();
  ctx.globalAlpha = style.disabled ? 0.25 : style.selected ? 0.9 : 0.45;
  ctx.strokeStyle = style.selected ? THEME.colors.cyan : style.color;
  ctx.lineWidth = style.selected ? 2 : 1;
  ctx.strokeRect(chip.x + 0.5, chip.y + 0.5, chip.w - 1, chip.h - 1);
  if (style.selected) {
    ctx.globalAlpha = 0.15;
    ctx.fillStyle = THEME.colors.cyan;
    ctx.fillRect(chip.x, chip.y, chip.w, chip.h);
  }
  ctx.restore();
  drawText(ctx, label, chip.x + chip.w / 2, chip.y + chip.h / 2 + 4, {
    size: 11,
    color: style.selected ? THEME.colors.cyan : style.color,
    align: 'center',
    alpha: style.disabled ? 0.3 : 0.9,
  });
}
