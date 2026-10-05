import { THEME } from '@/config/theme';
import type { InputFrame } from '@/input/inputFrame';
import type { UpgradeId } from '@/config/upgrades';
import { drawText, wrapLines } from '@/render/text';
import { upgradeSummary } from '@/ui/format';
import { MenuList } from '@/ui/menuList';
import { drawMenu, drawTitle } from '@/ui/menuRenderer';
import type { AppContext, Scene } from './scene';

const MENU_WIDTH = 320;

/** Paused over the frozen game (solo only; a duel can't pause). */
export class PauseScene implements Scene {
  readonly name = 'Pause';
  readonly overlay = true;
  private readonly app: AppContext;
  private readonly menu: MenuList;

  /** The run's upgrades in a line (Phase 20). */
  private readonly build: string;

  constructor(app: AppContext, params: { upgrades: readonly UpgradeId[] }) {
    this.app = app;
    this.build = upgradeSummary(params.upgrades);
    this.menu = new MenuList([
      { kind: 'action', label: 'RESUME', onSelect: () => app.close() },
      { kind: 'action', label: 'HOW TO PLAY', onSelect: () => app.open('howToPlay') },
      { kind: 'action', label: 'SETTINGS', onSelect: () => app.open('settings') },
      { kind: 'action', label: 'QUIT TO MENU', onSelect: () => app.goTo('menu') },
    ]);
  }

  update(_dt: number, input: InputFrame): void {
    if (input.back || input.pause) {
      this.app.close();
      return;
    }
    this.menu.update(input);
  }

  render(ctx: CanvasRenderingContext2D): void {
    const { width, height } = this.app.viewport;
    ctx.save();
    ctx.globalAlpha = 0.72;
    ctx.fillStyle = THEME.background;
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
    drawTitle(ctx, 'PAUSED', width / 2, height * 0.32);
    let top = height * 0.32 + 64;
    if (this.build) {
      ctx.save();
      ctx.font = `13px ${THEME.font}`;
      const lines = wrapLines(ctx, `UPGRADES: ${this.build}`, Math.min(640, width - 32));
      ctx.restore();
      lines.forEach((line, i) =>
        drawText(ctx, line, width / 2, top - 22 + i * 18, {
          size: 13,
          color: THEME.colors.cyan,
          align: 'center',
          alpha: 0.8,
        }),
      );
      top += lines.length * 18 + 4;
    }
    drawMenu(ctx, this.menu, width / 2, top, Math.min(MENU_WIDTH, width - 32), height - 8);
  }
}
