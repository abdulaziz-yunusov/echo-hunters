import { DUEL_VARIANTS } from '@/config/duel';
import { REPLAY } from '@/config/replay';
import { THEME } from '@/config/theme';
import type { InputFrame } from '@/input/inputFrame';
import { outcomeFor, replayDuration, type Replay, type ReplayMarkKind } from '@/replay/replay';
import { drawReplayWorld, MARK_COLORS, RIVAL_COLOR } from '@/render/replayRenderer';
import { drawText } from '@/render/text';
import { formatTime } from '@/ui/format';
import type { AppContext, Scene } from './scene';

/** Screen space kept free above and below the map (CSS px). */
const TOP = 64;
const BOTTOM = 112;
const SIDE = 16;
/** Timeline bar geometry (CSS px). */
const BAR_INSET = 120;
const BAR_HEIGHT = 10;
const BUTTON = { w: 80, h: 30 };
/** Timeline marks explained above the bar, and the width of one 11 px monospace character. */
const LEGEND: readonly ReplayMarkKind[] = ['hit', 'close', 'core', 'stun', 'pickup', 'beacon'];
/** Duels have no close calls. */
const DUEL_LEGEND: readonly ReplayMarkKind[] = [...LEGEND.filter((k) => k !== 'close'), 'overtime'];
const LEGEND_CHAR = 6.6;

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Watch a finished round again over the fully lit map (opened on top of the
 * level end, game over or duel end screen, and closed back to it). A duel
 * debrief shows both players' paths, "you" being `viewerId`. Keyboard: Enter
 * plays / pauses, left / right seek, up / down change speed, Esc leaves.
 * Mouse: click the timeline to jump, or the buttons.
 */
export class ReplayScene implements Scene {
  readonly name = 'Replay';
  private readonly app: AppContext;
  private readonly replay: Replay;
  private readonly viewerId: number;
  private readonly duration: number;
  private time = 0;
  private playing = true;
  private speedIndex: number = REPLAY.speeds.indexOf(REPLAY.defaultSpeed);

  constructor(app: AppContext, params: { replay: Replay; viewerId?: number }) {
    this.app = app;
    this.replay = params.replay;
    this.viewerId = params.viewerId ?? params.replay.playerId;
    this.duration = replayDuration(params.replay);
  }

  /** Current playback position (s). */
  get position(): number {
    return this.time;
  }

  get speed(): number {
    return REPLAY.speeds[this.speedIndex];
  }

  get isPlaying(): boolean {
    return this.playing;
  }

  update(dt: number, input: InputFrame): void {
    if (input.back) {
      this.app.close();
      return;
    }
    if (input.click && input.aim) this.clickAt(input.aim.x, input.aim.y);
    else if (input.confirm) this.togglePlay();
    if (input.navX !== 0) this.seek(this.time + input.navX * REPLAY.seekStep);
    // Up (-1) is faster.
    if (input.navY !== 0) this.changeSpeed(-input.navY);

    if (this.playing) {
      this.time += dt * this.speed;
      if (this.time >= this.duration) {
        this.time = this.duration;
        this.playing = false;
      }
    }
  }

  render(ctx: CanvasRenderingContext2D): void {
    const { width, height } = this.app.viewport;
    const { tiles } = this.replay.layout;
    const areaW = width - SIDE * 2;
    const areaH = height - TOP - BOTTOM;
    const scale = Math.min(areaW / tiles.worldWidth, areaH / tiles.worldHeight);

    ctx.save();
    ctx.translate(
      SIDE + (areaW - tiles.worldWidth * scale) / 2,
      TOP + (areaH - tiles.worldHeight * scale) / 2,
    );
    ctx.scale(scale, scale);
    drawReplayWorld(ctx, this.replay, this.time, 1 / scale, this.viewerId);
    ctx.restore();

    this.drawHeader(ctx, width);
    this.drawTimeline(ctx);
  }

  private togglePlay(): void {
    // Playing from the very end starts over.
    if (!this.playing && this.time >= this.duration) this.time = 0;
    this.playing = !this.playing;
  }

  private seek(time: number): void {
    this.time = Math.max(0, Math.min(this.duration, time));
  }

  private changeSpeed(step: number): void {
    const last = REPLAY.speeds.length - 1;
    this.speedIndex = Math.max(0, Math.min(last, this.speedIndex + step));
  }

  private clickAt(x: number, y: number): void {
    const bar = this.barRect();
    // The bar is thin: accept clicks a little above and below it.
    if (x >= bar.x && x <= bar.x + bar.w && Math.abs(y - (bar.y + bar.h / 2)) <= 14) {
      this.seek(((x - bar.x) / bar.w) * this.duration);
    } else if (inside(this.playRect(), x, y)) {
      this.togglePlay();
    } else if (inside(this.speedRect(), x, y)) {
      this.changeSpeed(this.speedIndex === REPLAY.speeds.length - 1 ? -this.speedIndex : 1);
    } else if (inside(this.backRect(), x, y)) {
      this.app.close();
    }
  }

  private drawHeader(ctx: CanvasRenderingContext2D, width: number): void {
    const r = this.replay;
    const title = r.duel
      ? `DUEL DEBRIEF · ${DUEL_VARIANTS[r.duel.variant].label}${r.duel.overtimeAt !== null ? ' · OVERTIME' : ''}`
      : `REPLAY · LEVEL ${r.level}`;
    drawText(ctx, title, width / 2, 34, {
      size: 20,
      color: THEME.colors.cyan,
      align: 'center',
      glow: THEME.glowBlur,
    });
    const outcome =
      OUTCOME_TEXT[`${r.duel ? 'duel' : 'solo'}:${outcomeFor(r, this.viewerId)}`] ?? '';
    drawText(ctx, [`SEED ${r.seed}`, outcome].filter(Boolean).join(' · '), width / 2, 54, {
      size: 12,
      color: THEME.colors.white,
      align: 'center',
      alpha: 0.5,
    });
    button(ctx, this.backRect(), '◀ BACK');
    if (r.duel) {
      // Key to the two paths, top right.
      const x = width - SIDE;
      drawText(ctx, 'YOU ━━', x, 30, { size: 12, color: THEME.colors.white, align: 'right' });
      drawText(ctx, 'RIVAL ┅┅', x, 46, {
        size: 12,
        color: THEME.colors[RIVAL_COLOR],
        align: 'right',
      });
    }
  }

  private drawTimeline(ctx: CanvasRenderingContext2D): void {
    const { width, height } = this.app.viewport;
    const bar = this.barRect();
    const white = THEME.colors.white;

    ctx.save();
    ctx.globalAlpha = 0.25;
    ctx.fillStyle = white;
    ctx.fillRect(bar.x, bar.y, bar.w, bar.h);
    const done = this.duration > 0 ? this.time / this.duration : 0;
    ctx.globalAlpha = 0.6;
    ctx.fillStyle = THEME.colors.cyan;
    ctx.fillRect(bar.x, bar.y, bar.w * done, bar.h);
    // Marks: short ticks above the bar.
    ctx.globalAlpha = 0.9;
    for (const m of this.replay.marks) {
      if (m.kind === 'end') continue;
      const mx = bar.x + (this.duration > 0 ? (m.time / this.duration) * bar.w : 0);
      ctx.fillStyle = THEME.colors[MARK_COLORS[m.kind]];
      ctx.fillRect(mx - 1, bar.y - 8, 2, 6);
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = white;
    ctx.fillRect(bar.x + bar.w * done - 1.5, bar.y - 4, 3, bar.h + 8);
    ctx.restore();

    button(ctx, this.playRect(), this.playing ? '❚❚' : '▶');
    button(ctx, this.speedRect(), `${this.speed}×`);
    drawText(
      ctx,
      `${formatTime(this.time)} / ${formatTime(this.duration)}`,
      bar.x + bar.w,
      bar.y - 14,
      { size: 12, color: white, align: 'right', alpha: 0.7 },
    );
    let lx = bar.x;
    for (const kind of this.replay.duel ? DUEL_LEGEND : LEGEND) {
      const label = kind.toUpperCase();
      drawText(ctx, label, lx, bar.y - 14, {
        size: 11,
        color: THEME.colors[MARK_COLORS[kind]],
        alpha: 0.8,
      });
      lx += (label.length + 2) * LEGEND_CHAR;
    }
    drawText(
      ctx,
      'ENTER play/pause · ◀ ▶ seek · ▲ ▼ speed · click the bar to jump · ESC back',
      width / 2,
      height - 22,
      { size: 12, color: white, align: 'center', alpha: 0.45 },
    );
  }

  private barRect(): Rect {
    const { width, height } = this.app.viewport;
    return { x: BAR_INSET, y: height - 72, w: width - BAR_INSET * 2, h: BAR_HEIGHT };
  }

  private playRect(): Rect {
    const bar = this.barRect();
    return { x: bar.x - BUTTON.w - 20, y: bar.y + bar.h / 2 - BUTTON.h / 2, ...BUTTON };
  }

  private speedRect(): Rect {
    const bar = this.barRect();
    return { x: bar.x + bar.w + 20, y: bar.y + bar.h / 2 - BUTTON.h / 2, ...BUTTON };
  }

  private backRect(): Rect {
    return { x: SIDE, y: 18, w: 100, h: BUTTON.h };
  }
}

/** Under the title: how the round ended, for whoever is watching. */
const OUTCOME_TEXT: Record<string, string> = {
  'solo:extracted': 'EXTRACTED',
  'solo:dead': 'SIGNAL LOST',
  'duel:extracted': 'YOU WON',
  'duel:lost': 'YOU LOST',
};

function inside(r: Rect, x: number, y: number): boolean {
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
}

function button(ctx: CanvasRenderingContext2D, r: Rect, label: string): void {
  ctx.save();
  ctx.globalAlpha = 0.5;
  ctx.strokeStyle = THEME.colors.cyan;
  ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
  ctx.restore();
  drawText(ctx, label, r.x + r.w / 2, r.y + r.h / 2 + 5, {
    size: 14,
    color: THEME.colors.white,
    align: 'center',
  });
}
