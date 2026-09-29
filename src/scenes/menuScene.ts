import { THEME } from '@/config/theme';
import type { InputFrame } from '@/input/inputFrame';
import { randomSeed, seedFromUrl } from '@/platform/seed';
import { loadSave } from '@/platform/storage';
import { drawText } from '@/render/text';
import { newRun } from './run';
import type { AppContext, Scene } from './scene';

/** Seconds between decorative title pulses. */
const PULSE_PERIOD = 2.2;

/** Title screen stub. The full menu (solo / duel / settings) arrives in Phase 10. */
export class MenuScene implements Scene {
  readonly name = 'Menu';
  private readonly app: AppContext;
  private readonly highScore = loadSave().highScore;
  private time = 0;

  constructor(app: AppContext) {
    this.app = app;
  }

  update(dt: number, input: InputFrame): void {
    this.time += dt;
    if (input.confirm) this.app.goTo('play', { run: newRun(seedFromUrl() ?? randomSeed()) });
  }

  render(ctx: CanvasRenderingContext2D): void {
    const { width, height } = this.app.viewport;
    const cx = width / 2;
    const cy = height / 2;

    // A sonar ring behind the title, as a hint of the core mechanic.
    const phase = (this.time % PULSE_PERIOD) / PULSE_PERIOD;
    ctx.save();
    ctx.strokeStyle = THEME.colors.cyan;
    ctx.globalAlpha = 1 - phase;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(cx, cy - 10, phase * Math.min(width, height) * 0.45, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    drawText(ctx, 'PULSE', cx, cy, {
      size: 56,
      color: THEME.colors.cyan,
      align: 'center',
      glow: THEME.glowBlur * 2,
    });
    drawText(ctx, 'ECHO HUNTERS', cx, cy + 32, {
      size: 16,
      color: THEME.colors.white,
      align: 'center',
      alpha: 0.7,
    });

    const blink = 0.35 + 0.65 * Math.abs(Math.sin(this.time * 2.5));
    drawText(ctx, 'PRESS ENTER OR CLICK TO START', cx, cy + 96, {
      size: 13,
      color: THEME.colors.white,
      align: 'center',
      alpha: blink,
    });

    if (this.highScore > 0) {
      drawText(ctx, `HIGH SCORE ${this.highScore}`, cx, cy + 128, {
        size: 12,
        color: THEME.colors.cyan,
        align: 'center',
        alpha: 0.7,
      });
    }
  }
}
