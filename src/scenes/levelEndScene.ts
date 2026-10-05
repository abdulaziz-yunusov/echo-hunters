import { THEME } from '@/config/theme';
import type { InputFrame } from '@/input/inputFrame';
import { loadSave, submitScore } from '@/platform/storage';
import { drawText } from '@/render/text';
import { formatTime } from '@/ui/format';
import { MenuList, type MenuItem } from '@/ui/menuList';
import { drawMenu } from '@/ui/menuRenderer';
import type { Replay } from '@/replay/replay';
import type { ScoreBreakdown } from '@/sim/scoring';
import { offerUpgrades } from '@/sim/upgrades';
import { MODIFIERS, type ModifierId } from '@/config/modifiers';
import { levelModifier } from '@/sim/modifiers';
import { customMapItems, replayItem } from './menuItems';
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
  /** "vs best: −12 s" against this map's best run (Phase 23); '' when unknown. */
  readonly versusBest: string;
  /** The level's modifier (Phase 21): it is in the score, and named. */
  private readonly modifier: ModifierId | null;

  constructor(
    app: AppContext,
    params: {
      run: RunState;
      score: ScoreBreakdown;
      seconds: number;
      replay?: Replay;
      best?: { previous: number | null; isNew: boolean };
    },
  ) {
    this.app = app;
    this.run = params.run;
    this.score = params.score;
    this.seconds = params.seconds;
    this.versusBest = versusBest(params.seconds, params.best);
    this.modifier = this.run.custom ? null : levelModifier(this.run.seed, this.run.level);
    this.next = nextLevel(this.run, this.score.total);
    // A hand-made map can be made easy, so it never counts for the high score (Phase 13).
    const high = this.run.custom
      ? { highScore: loadSave().highScore, isNew: false }
      : submitScore(this.next.score);
    this.highScore = high.highScore;
    this.isNewHigh = high.isNew;
    const onward: MenuItem[] = this.run.custom
      ? customMapItems(app, this.run)
      : [
          {
            kind: 'action',
            label: `NEXT: LEVEL ${this.next.level}`,
            // Pick an upgrade first (Phase 20), unless every one is maxed out.
            onSelect: () =>
              offerUpgrades(this.next.seed, this.next.level, this.next.upgrades).length > 0
                ? app.goTo('upgradePick', { run: this.next })
                : app.goTo('play', { run: this.next }),
          },
        ];
    this.menu = new MenuList([
      ...onward,
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
    const what = this.run.custom
      ? 'CUSTOM MAP'
      : `LEVEL ${this.run.level}${this.modifier ? ` · ${MODIFIERS[this.modifier].label}` : ''}`;
    drawText(ctx, `${what} · ${formatTime(this.seconds)}`, cx, y, {
      size: 14,
      color: white,
      align: 'center',
      alpha: 0.6,
    });
    if (this.versusBest) {
      drawText(ctx, this.versusBest, cx, y + 20, {
        size: 13,
        color: this.versusBest.startsWith('NEW') ? THEME.colors.green : white,
        align: 'center',
        alpha: 0.8,
      });
    }

    y += 44;
    const s = this.score;
    const rows: [string, number][] = [
      ['Signal Cores', s.cores],
      ['Extraction', s.extraction],
      ['Time bonus', s.timeBonus],
      ['Ghost bonus (no pings)', s.ghostBonus],
    ];
    if (s.stuns > 0) rows.push(['Hunters stunned', s.stuns]);
    if (s.closeCalls > 0) rows.push(['Close calls', s.closeCalls]);
    if (this.modifier) {
      const def = MODIFIERS[this.modifier];
      rows.push([`${def.label} ×${def.scoreMultiplier}`, s.modifier]);
    }
    for (const [label, points] of rows) {
      this.row(ctx, label, `+${points}`, y, points > 0 ? 1 : 0.4);
      y += LINE;
    }

    y += 8;
    this.row(ctx, 'LEVEL SCORE', `${s.total}`, y, 1, THEME.colors.cyan);
    y += LINE;
    this.row(ctx, 'RUN TOTAL', `${this.next.score}`, y, 1, THEME.colors.cyan);
    y += LINE;
    if (this.run.custom) {
      drawText(ctx, 'Custom maps don’t count for the high score.', cx, y, {
        size: 13,
        color: white,
        align: 'center',
        alpha: 0.5,
      });
    } else
      this.row(
        ctx,
        this.isNewHigh ? 'NEW HIGH SCORE!' : 'HIGH SCORE',
        `${this.highScore}`,
        y,
        1,
        this.isNewHigh ? THEME.colors.green : white,
      );

    if (this.time >= INPUT_GRACE) drawMenu(ctx, this.menu, cx, y + 60, 300, height - 8);
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

/**
 * How this round compares with the map's best before it: "NEW BEST · −12 s",
 * "vs best: +4 s", or "FIRST RUN ON THIS MAP".
 */
export function versusBest(
  seconds: number,
  best: { previous: number | null; isNew: boolean } | undefined,
): string {
  if (!best) return '';
  if (best.previous === null) return best.isNew ? 'FIRST RUN ON THIS MAP: GHOST SAVED' : '';
  const diff = Math.round(seconds - best.previous);
  const signed = diff < 0 ? `−${-diff} s` : `+${diff} s`;
  return best.isNew ? `NEW BEST · ${signed} · GHOST SAVED` : `vs best: ${signed}`;
}
