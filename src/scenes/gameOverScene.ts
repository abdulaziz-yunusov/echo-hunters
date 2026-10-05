import { THEME } from '@/config/theme';
import type { InputFrame } from '@/input/inputFrame';
import { randomSeed } from '@/platform/seed';
import { loadSave, submitDaily, submitScore } from '@/platform/storage';
import { copyText, pageUrl } from '@/platform/clipboard';
import { dailyResult } from '@/platform/daily';
import { drawText } from '@/render/text';
import { MenuList, type MenuItem } from '@/ui/menuList';
import { drawMenu } from '@/ui/menuRenderer';
import type { Replay } from '@/replay/replay';
import type { ScoreBreakdown } from '@/sim/scoring';
import { customMapItems, replayItem } from './menuItems';
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
  /** Daily Seed: today's best score, and whether this run set it. */
  private readonly daily: { best: number; isNew: boolean } | null;
  /** COPY RESULT's answer. */
  private copied = '';

  constructor(app: AppContext, params: { run: RunState; score: ScoreBreakdown; replay?: Replay }) {
    this.app = app;
    this.run = params.run;
    // Points earned before dying (cores, stuns) still count.
    this.finalScore = params.run.score + params.score.total;
    const run = this.run;
    const high = run.custom
      ? { highScore: loadSave().highScore, isNew: false }
      : submitScore(this.finalScore);
    this.highScore = high.highScore;
    this.isNewHigh = high.isNew;
    // Daily Seed (Phase 13): today's best, and a result to share.
    this.daily = run.daily ? submitDaily(run.daily, this.finalScore) : null;
    const items: MenuItem[] = [];
    if (run.custom) items.push(...customMapItems(app, run));
    else if (run.daily) {
      const date = run.daily;
      items.push(
        {
          kind: 'action',
          label: 'COPY RESULT',
          value: () => this.copied,
          onSelect: () => {
            const text = dailyResult(
              { date, level: run.level, score: this.finalScore, difficulty: run.difficulty },
              pageUrl(),
            );
            void copyText(text).then((ok) => (this.copied = ok ? 'COPIED' : 'NOT ALLOWED'));
          },
        },
        {
          kind: 'action',
          label: 'TRY TODAY AGAIN',
          onSelect: () =>
            app.goTo('play', { run: newRun(run.seed, run.difficulty, { daily: date }) }),
        },
      );
    } else {
      items.push({
        kind: 'action',
        label: 'NEW RUN',
        onSelect: () => app.goTo('play', { run: newRun(randomSeed(), run.difficulty) }),
      });
    }
    this.menu = new MenuList([
      ...items,
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
    const where = this.run.custom
      ? 'Caught on your custom map'
      : this.run.daily
        ? `Daily ${this.run.daily} · caught on level ${this.run.level}`
        : `Caught on level ${this.run.level}`;
    drawText(ctx, where, cx, cy - 36, {
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
    // Daily: today's best; custom maps: not counted; otherwise the high score.
    const line = this.daily
      ? this.daily.isNew
        ? 'NEW BEST TODAY!'
        : `BEST TODAY ${this.daily.best}`
      : this.run.custom
        ? 'Custom maps don’t count for the high score.'
        : this.isNewHigh
          ? 'NEW HIGH SCORE!'
          : `HIGH SCORE ${this.highScore}`;
    const good = this.daily ? this.daily.isNew : this.isNewHigh;
    drawText(ctx, line, cx, cy + 38, {
      size: 14,
      color: good ? THEME.colors.green : white,
      align: 'center',
      alpha: good ? 1 : 0.7,
    });

    if (this.time >= INPUT_GRACE) drawMenu(ctx, this.menu, cx, cy + 96, 260, height - 8);
  }
}
