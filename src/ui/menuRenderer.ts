import { THEME } from '@/config/theme';
import { drawText } from '@/render/text';
import type { MenuList } from './menuList';

/** Draw a laid-out MenuList in the game's style. Call `menu.layout` first. */
export function drawMenu(
  ctx: CanvasRenderingContext2D,
  menu: MenuList,
  centerX: number,
  top: number,
  width: number,
): void {
  const rects = menu.layout(centerX, top, width);
  menu.items.forEach((item, i) => {
    const r = rects[i];
    const y = r.y + r.h / 2 + 5;
    const selected = i === menu.selected;
    const disabled = menu.isDisabled(i);
    const color = selected ? THEME.colors.cyan : THEME.colors.white;
    const alpha = disabled ? 0.3 : selected ? 1 : 0.7;

    if (selected && !disabled) {
      ctx.save();
      ctx.globalAlpha = 0.12;
      ctx.fillStyle = THEME.colors.cyan;
      ctx.fillRect(r.x, r.y + 3, r.w, r.h - 6);
      ctx.restore();
    }

    if (item.kind === 'adjust') {
      drawText(ctx, item.label, r.x + 16, y, { size: 15, color, alpha });
      drawText(ctx, `◀ ${item.value()} ▶`, r.x + r.w - 16, y, {
        size: 15,
        color,
        alpha,
        align: 'right',
      });
      return;
    }
    const value = disabled ? item.note : item.value?.();
    if (value) {
      drawText(ctx, item.label, r.x + 16, y, { size: 15, color, alpha });
      drawText(ctx, value, r.x + r.w - 16, y, { size: 15, color, alpha, align: 'right' });
    } else {
      drawText(ctx, item.label, centerX, y, {
        size: 16,
        color,
        alpha,
        align: 'center',
        glow: selected ? 6 : 0,
      });
    }
  });
}

/** A screen title in the game's style. */
export function drawTitle(ctx: CanvasRenderingContext2D, text: string, x: number, y: number): void {
  drawText(ctx, text, x, y, {
    size: 30,
    color: THEME.colors.cyan,
    align: 'center',
    glow: THEME.glowBlur,
  });
}
