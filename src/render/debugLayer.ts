import { THEME } from '@/config/theme';
import type { Viewport } from '@/platform/viewport';
import { drawText } from './text';

/** How often the FPS numbers refresh (s). */
const SAMPLE_WINDOW = 0.5;
const LINE_HEIGHT = 14;
const PADDING = 8;

/**
 * F1 overlay: frame rate, tick rate, screen info, plus any values other
 * systems publish with watch(). Later phases add world drawings (full map,
 * hunter paths, sound polygons) that scenes draw when `enabled` is true.
 */
export class DebugLayer {
  enabled = false;

  private readonly watches = new Map<string, string>();
  private sampleTime = 0;
  private sampleFrames = 0;
  private sampleTicks = 0;
  private fps = 0;
  private tps = 0;
  private frameMs = 0;

  toggle(): void {
    this.enabled = !this.enabled;
  }

  /** Show a live value under `key`. Cheap enough to call every tick. */
  watch(key: string, value: string | number): void {
    const text =
      typeof value !== 'number' ? value : Number.isInteger(value) ? `${value}` : value.toFixed(2);
    this.watches.set(key, text);
  }

  clearWatches(): void {
    this.watches.clear();
  }

  /** Count one simulation tick. */
  tick(): void {
    this.sampleTicks++;
  }

  /** Count one rendered frame. */
  frame(frameDelta: number): void {
    this.sampleFrames++;
    this.sampleTime += frameDelta;
    if (this.sampleTime >= SAMPLE_WINDOW) {
      this.fps = this.sampleFrames / this.sampleTime;
      this.tps = this.sampleTicks / this.sampleTime;
      this.frameMs = (this.sampleTime / this.sampleFrames) * 1000;
      this.sampleTime = 0;
      this.sampleFrames = 0;
      this.sampleTicks = 0;
    }
  }

  render(ctx: CanvasRenderingContext2D, viewport: Viewport, sceneName: string): void {
    if (!this.enabled) return;

    const lines = [
      `FPS   ${this.fps.toFixed(0)}  (${this.frameMs.toFixed(1)} ms)`,
      `TICKS ${this.tps.toFixed(0)}/s`,
      `SCENE ${sceneName}`,
      `SCREEN ${viewport.width.toFixed(0)}x${viewport.height.toFixed(0)} @${viewport.dpr}x`,
      `WORLD ${viewport.worldWidth.toFixed(0)}x${viewport.worldHeight.toFixed(0)} (x${viewport.worldScale.toFixed(2)})`,
      ...[...this.watches].map(([key, value]) => `${key.toUpperCase()} ${value}`),
    ];

    const width = 260;
    const height = lines.length * LINE_HEIGHT + PADDING * 2;
    const x = viewport.width - width - PADDING;
    const y = PADDING;

    ctx.save();
    ctx.globalAlpha = 0.75;
    ctx.fillStyle = '#000';
    ctx.fillRect(x, y, width, height);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = THEME.colors.orange;
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, width - 1, height - 1);
    ctx.restore();

    lines.forEach((line, i) => {
      drawText(ctx, line, x + PADDING, y + PADDING + i * LINE_HEIGHT, {
        size: 11,
        color: THEME.colors.orange,
        baseline: 'top',
      });
    });
  }
}
