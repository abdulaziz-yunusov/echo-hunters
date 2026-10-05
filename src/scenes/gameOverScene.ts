import { THEME } from '@/config/theme';
import type { InputFrame } from '@/input/inputFrame';
import { randomSeed } from '@/platform/seed';
import { submitScore } from '@/platform/storage';
import { drawText } from '@/render/text';
import { MenuList } from '@/ui/menuList';
import { drawMenu } from '@/ui/menuRenderer';
import type { Replay } from '@/replay/replay';
import type { ScoreBreakdown } from '@/sim/scoring';
import { replayItem } from './menuItems';
import { newRun, type RunState } from './run';
import type { AppContext, Scene } from './scene';

/** Keys are ignored this long, so a key still held from gameplay doesn't skip the screen (s). */
const INPUT_GRACE = 0.8;

/** The run is over: how far it got, the final score and the high score. */
export class GameOverScene implements Scene {
  readonly name = 'GameOver';
  private readonly app: AppContext;
  private readonly run: RunState;
  private readonly finalScore: number;
  private readonly highScore: number;
  private readonly isNewHigh: boolean;
  private readonly menu: MenuList;
  private time = 0;

  constructor(app: AppContext, params: { run: RunState; score: ScoreBreakdown; replay?: Replay }) {
    this.app = app;
    this.run = params.run;
    // Points earned before dying (cores, stuns) still count.
    this.finalScore = params.run.score + params.score.total;
    const high = submitScore(this.finalScore);
    this.highScore = high.highScore;
    this.isNewHigh = high.isNew;
    this.menu = new MenuList([
      {
        kind: 'action',
        label: 'NEW RUN',
        onSelect: () => app.goTo('play', { run: newRun(randomSeed(), this.run.difficulty) }),
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
    const cy = height / 2;
    const white = THEME.colors.white;

    drawText(ctx, 'SIGNAL LOST', cx, cy - 70, {
      size: 44,
      color: THEME.colors.red,
      align: 'center',
      glow: THEME.glowBlur * 2,
    });
    drawText(ctx, `Caught on level ${this.run.level}`, cx, cy - 36, {
      size: 14,
      color: white,
      align: 'center',
      alpha: 0.6,
    });
    drawText(ctx, `SCORE ${this.finalScore}`, cx, cy + 10, {
      size: 20,
      color: THEME.colors.cyan,
      align: 'center',
    });
    drawText(
      ctx,
      this.isNewHigh ? 'NEW HIGH SCORE!' : `HIGH SCORE ${this.highScore}`,
      cx,
      cy + 38,
      {
        size: 14,
        color: this.isNewHigh ? THEME.colors.green : white,
        align: 'center',
        alpha: this.isNewHigh ? 1 : 0.7,
      },
    );

    if (this.time >= INPUT_GRACE) drawMenu(ctx, this.menu, cx, cy + 96, 260, height - 8);
  }
}
