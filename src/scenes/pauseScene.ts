import { THEME } from '@/config/theme';
import type { InputFrame } from '@/input/inputFrame';
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

  constructor(app: AppContext) {
    this.app = app;
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
    drawMenu(ctx, this.menu, width / 2, height * 0.32 + 64, Math.min(MENU_WIDTH, width - 32));
  }
}
