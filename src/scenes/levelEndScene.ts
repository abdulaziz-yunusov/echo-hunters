import { THEME } from '@/config/theme';
import type { InputFrame } from '@/input/inputFrame';
import { submitScore } from '@/platform/storage';
import { drawText } from '@/render/text';
import { formatTime } from '@/ui/format';
import { MenuList } from '@/ui/menuList';
import { drawMenu } from '@/ui/menuRenderer';
import type { Replay } from '@/replay/replay';
import type { ScoreBreakdown } from '@/sim/scoring';
import { replayItem } from './menuItems';
import { nextLevel, type RunState } from './run';
import type { AppContext, Scene } from './scene';

/** Keys are ignored this long, so a key still held from gameplay doesn't skip the screen (s). */
const INPUT_GRACE = 0.6;
const LINE = 24;

/** After extraction: the level's score breakdown, run total and high score. */
export class LevelEndScene implements Scene {
  readonly name = 'LevelEnd';
  private readonly app: AppContext;
  private readonly run: RunState;
  private readonly score: ScoreBreakdown;
  private readonly seconds: number;
  private readonly next: RunState;
  private readonly highScore: number;
  private readonly isNewHigh: boolean;
  private readonly menu: MenuList;
  private time = 0;

  constructor(
    app: AppContext,
    params: { run: RunState; score: ScoreBreakdown; seconds: number; replay?: Replay },
  ) {
    this.app = app;
    this.run = params.run;
    this.score = params.score;
    this.seconds = params.seconds;
    this.next = nextLevel(this.run, this.score.total);
    const high = submitScore(this.next.score);
    this.highScore = high.highScore;
    this.isNewHigh = high.isNew;
    this.menu = new MenuList([
      {
        kind: 'action',
        label: `NEXT: LEVEL ${this.next.level}`,
        onSelect: () => app.goTo('play', { run: this.next }),
      },
      ...replayItem(app, params.replay),
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
    let y = height / 2 - 150;
    const white = THEME.colors.white;

    drawText(ctx, 'EXTRACTED', cx, y, {
      size: 40,
      color: THEME.colors.green,
      align: 'center',
      glow: THEME.glowBlur * 2,
    });
    y += 30;
    drawText(ctx, `LEVEL ${this.run.level} · ${formatTime(this.seconds)}`, cx, y, {
      size: 14,
      color: white,
      align: 'center',
      alpha: 0.6,
    });

    y += 44;
    const s = this.score;
    const rows: [string, number][] = [
      ['Signal Cores', s.cores],
      ['Extraction', s.extraction],
      ['Time bonus', s.timeBonus],
      ['Ghost bonus (no pings)', s.ghostBonus],
    ];
    if (s.stuns > 0) rows.push(['Hunters stunned', s.stuns]);
    for (const [label, points] of rows) {
      this.row(ctx, label, `+${points}`, y, points > 0 ? 1 : 0.4);
      y += LINE;
    }

    y += 8;
    this.row(ctx, 'LEVEL SCORE', `${s.total}`, y, 1, THEME.colors.cyan);
    y += LINE;
    this.row(ctx, 'RUN TOTAL', `${this.next.score}`, y, 1, THEME.colors.cyan);
    y += LINE;
    this.row(
      ctx,
      this.isNewHigh ? 'NEW HIGH SCORE!' : 'HIGH SCORE',
      `${this.highScore}`,
      y,
      1,
      this.isNewHigh ? THEME.colors.green : white,
    );

    if (this.time >= INPUT_GRACE) drawMenu(ctx, this.menu, cx, y + 60, 300);
  }

  private row(
    ctx: CanvasRenderingContext2D,
    label: string,
    value: string,
    y: number,
    alpha: number,
    color: string = THEME.colors.white,
  ): void {
    const cx = this.app.viewport.width / 2;
    drawText(ctx, label, cx - 170, y, { size: 15, color, alpha });
    drawText(ctx, value, cx + 170, y, { size: 15, color, alpha, align: 'right' });
  }
}
