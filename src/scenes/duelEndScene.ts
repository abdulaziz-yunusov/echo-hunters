import { THEME } from '@/config/theme';
import type { InputFrame } from '@/input/inputFrame';
import { drawText } from '@/render/text';
import { MenuList } from '@/ui/menuList';
import { drawMenu } from '@/ui/menuRenderer';
import type { AppContext, Scene } from './scene';

export type DuelOutcome = 'won' | 'lost' | 'disconnected';

const TEXT: Record<DuelOutcome, { title: string; color: string; line: string }> = {
  won: { title: 'YOU WIN', color: THEME.colors.green, line: 'You extracted first.' },
  lost: { title: 'YOU LOSE', color: THEME.colors.red, line: 'Your rival extracted first.' },
  disconnected: {
    title: 'CONNECTION LOST',
    color: THEME.colors.orange,
    line: 'Your opponent left or the connection dropped.',
  },
};

/** Keys are ignored this long, so a key still held from the duel doesn't skip the screen (s). */
const INPUT_GRACE = 0.8;

/** How the duel ended, and where to go next. */
export class DuelEndScene implements Scene {
  readonly name = 'DuelEnd';
  private readonly app: AppContext;
  private readonly outcome: DuelOutcome;
  private readonly menu: MenuList;
  private time = 0;

  constructor(app: AppContext, params: { outcome: DuelOutcome }) {
    this.app = app;
    this.outcome = params.outcome;
    this.menu = new MenuList([
      { kind: 'action', label: 'NEW DUEL', onSelect: () => app.goTo('duelLobby') },
      { kind: 'action', label: 'MAIN MENU', onSelect: () => app.goTo('menu') },
    ]);
  }

  update(dt: number, input: InputFrame): void {
    this.time += dt;
    if (this.time < INPUT_GRACE) return;
    if (input.back) this.app.goTo('menu');
    else this.menu.update(input);
  }

  render(ctx: CanvasRenderingContext2D): void {
    const { width, height } = this.app.viewport;
    const cx = width / 2;
    const cy = height / 2;
    const t = TEXT[this.outcome];
    drawText(ctx, t.title, cx, cy - 60, {
      size: 44,
      color: t.color,
      align: 'center',
      glow: THEME.glowBlur * 2,
    });
    drawText(ctx, t.line, cx, cy - 24, {
      size: 14,
      color: THEME.colors.white,
      align: 'center',
      alpha: 0.7,
    });
    if (this.time >= INPUT_GRACE) drawMenu(ctx, this.menu, cx, cy + 40, 260);
  }
}
