import { DIFFICULTIES, type DifficultyId } from '@/config/difficulty';
import { THEME } from '@/config/theme';
import type { InputFrame } from '@/input/inputFrame';
import { randomSeed, seedFromUrl } from '@/platform/seed';
import { loadSave, updateSave } from '@/platform/storage';
import { drawText } from '@/render/text';
import { MenuList, ROW_HEIGHT } from '@/ui/menuList';
import { drawMenu } from '@/ui/menuRenderer';
import { newRun } from './run';
import type { AppContext, Scene } from './scene';

/** Seconds between decorative title pulses. */
const PULSE_PERIOD = 2.2;
const DIFFICULTY_ORDER = Object.keys(DIFFICULTIES) as DifficultyId[];
const MENU_WIDTH = 360;

/** Title screen: play, pick the difficulty, learn, change settings. */
export class MenuScene implements Scene {
  readonly name = 'Menu';
  private readonly app: AppContext;
  private readonly menu: MenuList;
  private readonly highScore: number;
  private difficulty: DifficultyId;
  private time = 0;

  constructor(app: AppContext) {
    this.app = app;
    const save = loadSave();
    this.highScore = save.highScore;
    this.difficulty = save.difficulty;
    this.menu = new MenuList([
      { kind: 'action', label: 'PLAY SOLO', onSelect: () => this.play() },
      {
        kind: 'action',
        label: 'DUEL (1v1 ONLINE)',
        onSelect: () => {},
        disabled: true,
        note: 'COMING SOON',
      },
      {
        kind: 'adjust',
        label: 'DIFFICULTY',
        value: () => DIFFICULTIES[this.difficulty].label,
        onChange: (step) => this.cycleDifficulty(step),
      },
      { kind: 'action', label: 'HOW TO PLAY', onSelect: () => app.open('howToPlay') },
      { kind: 'action', label: 'SETTINGS', onSelect: () => app.open('settings') },
    ]);
  }

  update(dt: number, input: InputFrame): void {
    this.time += dt;
    this.menu.update(input);
  }

  render(ctx: CanvasRenderingContext2D): void {
    const { width, height } = this.app.viewport;
    const cx = width / 2;
    const titleY = Math.max(90, height * 0.28);
    const white = THEME.colors.white;

    // A sonar ring behind the title, as a hint of the core mechanic.
    const phase = (this.time % PULSE_PERIOD) / PULSE_PERIOD;
    ctx.save();
    ctx.strokeStyle = THEME.colors.cyan;
    ctx.globalAlpha = (1 - phase) * 0.8;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(cx, titleY - 10, phase * Math.min(width, height) * 0.45, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    drawText(ctx, 'PULSE', cx, titleY, {
      size: 56,
      color: THEME.colors.cyan,
      align: 'center',
      glow: THEME.glowBlur * 2,
    });
    drawText(ctx, 'ECHO HUNTERS', cx, titleY + 32, {
      size: 16,
      color: white,
      align: 'center',
      alpha: 0.7,
    });

    const menuTop = titleY + 90;
    drawMenu(ctx, this.menu, cx, menuTop, Math.min(MENU_WIDTH, width - 32));
    const below = menuTop + this.menu.items.length * ROW_HEIGHT;
    drawText(ctx, DIFFICULTIES[this.difficulty].hint, cx, below, {
      size: 11,
      color: white,
      align: 'center',
      alpha: 0.45,
    });
    if (this.highScore > 0) {
      drawText(ctx, `HIGH SCORE ${this.highScore}`, cx, below + 28, {
        size: 12,
        color: THEME.colors.cyan,
        align: 'center',
        alpha: 0.7,
      });
    }
    drawText(ctx, 'HEADPHONES RECOMMENDED', cx, height - 28, {
      size: 11,
      color: white,
      align: 'center',
      alpha: 0.4,
    });
  }

  private play(): void {
    this.app.goTo('play', { run: newRun(seedFromUrl() ?? randomSeed(), this.difficulty) });
  }

  private cycleDifficulty(step: number): void {
    const i = DIFFICULTY_ORDER.indexOf(this.difficulty);
    const n = DIFFICULTY_ORDER.length;
    this.difficulty = DIFFICULTY_ORDER[(i + step + n) % n];
    updateSave({ difficulty: this.difficulty });
  }
}
