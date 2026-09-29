import type { InputFrame } from '@/input/inputFrame';

/** A button: select it to do something. `value` shows extra text on the right. */
export interface ActionItem {
  kind: 'action';
  label: string;
  onSelect(): void;
  value?(): string;
  disabled?: boolean;
  /** Shown instead of the value when disabled (e.g. "coming soon"). */
  note?: string;
}

/** A setting changed with left/right (or by clicking its arrows): volume, difficulty, … */
export interface AdjustItem {
  kind: 'adjust';
  label: string;
  value(): string;
  onChange(step: 1 | -1): void;
}

export type MenuItem = ActionItem | AdjustItem;

export interface ItemRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Where a click landed on an item. */
export type HitZone = 'left' | 'right' | 'body';

/** Space for each row, in CSS pixels. */
export const ROW_HEIGHT = 34;
/** Clicks this close to an adjustable row's ends hit its ◀ / ▶ arrows. */
const ARROW_ZONE = 60;

/**
 * A vertical menu: keyboard (up/down, left/right, Enter), mouse (hover to
 * select, click to choose, click the arrows to adjust). Holds no drawing
 * code: `layout` places the rows and menuRenderer draws them, so the logic
 * is testable without a canvas.
 */
export class MenuList {
  readonly items: readonly MenuItem[];
  selected: number;
  private rects: ItemRect[] = [];
  private lastAim: { x: number; y: number } | null = null;

  constructor(items: readonly MenuItem[], selected = 0) {
    this.items = items;
    this.selected = this.firstEnabled(selected);
  }

  /** Place the rows: centered on `centerX`, the first row's middle at `top`. */
  layout(centerX: number, top: number, width: number): readonly ItemRect[] {
    this.rects = this.items.map((_, i) => ({
      x: centerX - width / 2,
      y: top + i * ROW_HEIGHT - ROW_HEIGHT / 2,
      w: width,
      h: ROW_HEIGHT,
    }));
    return this.rects;
  }

  /** Handle one tick of input. Call `layout` first (at least once) so the mouse can hit rows. */
  update(input: InputFrame): void {
    this.hover(input);
    if (input.click && input.aim) {
      const hit = this.hitTest(input.aim.x, input.aim.y);
      if (hit) {
        this.selected = hit.index;
        this.activate(hit.zone);
      }
      return; // a click that misses every row does nothing
    }
    if (input.navY !== 0) this.move(input.navY);
    if (input.navX !== 0) this.adjust(input.navX as 1 | -1);
    else if (input.confirm) this.activate('body');
  }

  hitTest(x: number, y: number): { index: number; zone: HitZone } | null {
    for (let i = 0; i < this.rects.length; i++) {
      const r = this.rects[i];
      if (x < r.x || x > r.x + r.w || y < r.y || y > r.y + r.h) continue;
      if (this.isDisabled(i)) return null;
      const zone: HitZone =
        this.items[i].kind !== 'adjust'
          ? 'body'
          : x < r.x + ARROW_ZONE
            ? 'left'
            : x > r.x + r.w - ARROW_ZONE
              ? 'right'
              : 'body';
      return { index: i, zone };
    }
    return null;
  }

  isDisabled(index: number): boolean {
    const item = this.items[index];
    return item.kind === 'action' && item.disabled === true;
  }

  /** Mouse movement selects the row under the pointer (keyboard keeps working in between). */
  private hover(input: InputFrame): void {
    const aim = input.aim;
    const moved = aim && (!this.lastAim || aim.x !== this.lastAim.x || aim.y !== this.lastAim.y);
    this.lastAim = aim;
    if (!moved || !aim) return;
    const hit = this.hitTest(aim.x, aim.y);
    if (hit) this.selected = hit.index;
  }

  private move(step: number): void {
    const n = this.items.length;
    let i = this.selected;
    for (let tries = 0; tries < n; tries++) {
      i = (i + step + n) % n;
      if (!this.isDisabled(i)) break;
    }
    this.selected = i;
  }

  private adjust(step: 1 | -1): void {
    const item = this.items[this.selected];
    if (item.kind === 'adjust') item.onChange(step);
  }

  private activate(zone: HitZone): void {
    const item = this.items[this.selected];
    if (this.isDisabled(this.selected)) return;
    if (item.kind === 'action') item.onSelect();
    else item.onChange(zone === 'left' ? -1 : 1);
  }

  private firstEnabled(from: number): number {
    for (let k = 0; k < this.items.length; k++) {
      const i = (from + k) % this.items.length;
      if (!this.isDisabled(i)) return i;
    }
    return 0;
  }
}

/** Text bar for a 0..1 value: ▓▓▓▓▓░░░░░ 50% */
export function levelBar(value: number, blocks = 10): string {
  const filled = Math.round(value * blocks);
  return `${'▓'.repeat(filled)}${'░'.repeat(blocks - filled)} ${Math.round(value * 100)}%`;
}
