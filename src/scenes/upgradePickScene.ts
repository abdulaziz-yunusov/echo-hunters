import { THEME } from '@/config/theme';
import { UPGRADES, type UpgradeId } from '@/config/upgrades';
import type { InputFrame } from '@/input/inputFrame';
import { drawText, wrapLines } from '@/render/text';
import { offerUpgrades, stacksOf } from '@/sim/upgrades';
import { chipAt, type Chip } from '@/ui/chips';
import { upgradeSummary } from '@/ui/format';
import { drawTitle } from '@/ui/menuRenderer';
import { withUpgrade, type RunState } from './run';
import type { AppContext, Scene } from './scene';

/** Keys are ignored this long, so the confirm that left Level End doesn't pick a card (s). */
const INPUT_GRACE = 0.5;
/** Cards side by side on a wide screen; stacked (shorter) on a narrow one. */
const ROW_CARD = { w: 220, h: 150 };
const COLUMN_CARD = { maxW: 380, h: 96 };
const GAP = 16;

/**
 * Between levels (Phase 20): pick one of the offered upgrades, kept for
 * the rest of the run. There is no skipping. Keyboard (arrows + confirm),
 * mouse (hover + click) or a tap.
 */
export class UpgradePickScene implements Scene {
  readonly name = 'UpgradePick';
  readonly offers: readonly UpgradeId[];
  private readonly app: AppContext;
  private readonly run: RunState;
  private selected = 0;
  /** Where each card was last drawn (screen px), for the pointer. */
  cards: Chip[] = [];
  private lastAim: InputFrame['aim'] = null;
  private time = 0;

  /** @param run the run about to play its next level. */
  constructor(app: AppContext, params: { run: RunState }) {
    this.app = app;
    this.run = params.run;
    this.offers = offerUpgrades(this.run.seed, this.run.level, this.run.upgrades);
  }

  update(dt: number, input: InputFrame): void {
    this.time += dt;
    if (this.offers.length === 0) {
      this.app.goTo('play', { run: this.run });
      return;
    }
    if (this.time < INPUT_GRACE) return;
    const aim = input.aim;
    const moved = aim && (!this.lastAim || aim.x !== this.lastAim.x || aim.y !== this.lastAim.y);
    this.lastAim = aim;
    if (aim) {
      const under = chipAt(this.cards, aim.x, aim.y);
      if (input.click) {
        if (under >= 0) this.pick(under);
        return; // a click beside the cards does nothing
      }
      if (moved && under >= 0) this.selected = under;
    }
    const step = input.navX || input.navY;
    const n = this.offers.length;
    if (step !== 0) this.selected = (this.selected + step + n) % n;
    else if (input.confirm) this.pick(this.selected);
  }

  private pick(index: number): void {
    this.app.goTo('play', { run: withUpgrade(this.run, this.offers[index]) });
  }

  render(ctx: CanvasRenderingContext2D): void {
    const { width, height } = this.app.viewport;
    const cx = width / 2;
    const white = THEME.colors.white;
    const top = Math.max(60, height * 0.16);
    drawTitle(ctx, 'CHOOSE AN UPGRADE', cx, top);
    drawText(ctx, `For the rest of the run · next: LEVEL ${this.run.level}`, cx, top + 30, {
      size: 13,
      color: white,
      align: 'center',
      alpha: 0.6,
    });

    this.cards = layoutCards(this.offers.length, width, top + 60);
    this.offers.forEach((id, i) => this.drawCard(ctx, this.cards[i], id, i === this.selected));

    const last = this.cards[this.cards.length - 1];
    const summary = upgradeSummary(this.run.upgrades);
    if (summary && last) {
      ctx.save();
      ctx.font = `12px ${THEME.font}`;
      const lines = wrapLines(ctx, `YOURS: ${summary}`, Math.min(720, width - 32));
      ctx.restore();
      lines.forEach((line, i) =>
        drawText(ctx, line, cx, last.y + last.h + 36 + i * 17, {
          size: 12,
          color: white,
          align: 'center',
          alpha: 0.6,
        }),
      );
    }
  }

  private drawCard(ctx: CanvasRenderingContext2D, card: Chip, id: UpgradeId, selected: boolean) {
    const def = UPGRADES[id];
    const color = selected ? THEME.colors.cyan : THEME.colors.white;
    ctx.save();
    ctx.globalAlpha = selected ? 0.14 : 0.05;
    ctx.fillStyle = color;
    ctx.fillRect(card.x, card.y, card.w, card.h);
    ctx.globalAlpha = selected ? 0.9 : 0.35;
    ctx.strokeStyle = color;
    ctx.lineWidth = selected ? 2 : 1;
    ctx.strokeRect(card.x + 0.5, card.y + 0.5, card.w - 1, card.h - 1);
    ctx.font = `13px ${THEME.font}`;
    const lines = wrapLines(ctx, def.description, card.w - 24);
    ctx.restore();

    const left = card.x + 12;
    drawText(ctx, def.label, left, card.y + 26, {
      size: 16,
      color,
      glow: selected ? 6 : 0,
    });
    lines.forEach((line, i) =>
      drawText(ctx, line, left, card.y + 50 + i * 18, {
        size: 13,
        color: THEME.colors.white,
        alpha: 0.85,
      }),
    );
    const owned = stacksOf(this.run.upgrades, id);
    const stacks = owned === 0 ? 'NEW' : `${owned} → ${owned + 1} OF ${def.maxStacks}`;
    drawText(ctx, stacks, left, card.y + card.h - 12, {
      size: 11,
      color: THEME.colors.white,
      alpha: 0.5,
    });
  }
}

/** Cards in a row if they fit, else one under another, centered (CSS px). */
export function layoutCards(count: number, width: number, top: number): Chip[] {
  const rowWidth = count * ROW_CARD.w + (count - 1) * GAP;
  if (rowWidth <= width - 32) {
    const left = (width - rowWidth) / 2;
    return Array.from({ length: count }, (_, i) => ({
      x: left + i * (ROW_CARD.w + GAP),
      y: top,
      ...ROW_CARD,
    }));
  }
  const w = Math.min(COLUMN_CARD.maxW, width - 32);
  return Array.from({ length: count }, (_, i) => ({
    x: (width - w) / 2,
    y: top + i * (COLUMN_CARD.h + GAP / 2),
    w,
    h: COLUMN_CARD.h,
  }));
}
