import { DISPLAY, type GlowSetting } from '@/config/display';

/**
 * Glow (canvas shadowBlur) is the most expensive thing the game draws, and
 * on a phone it is the GPU's job, which no desktop test can measure
 * (Phase 12). So it can switch itself off: on AUTO, frames that average
 * slower than `DISPLAY.glow.slowFrame` for `judgeSeconds` turn glow off for
 * the rest of the session (no flicker back and forth). ON and OFF force it.
 */
export class GlowGovernor {
  private setting: GlowSetting;
  private average = 1 / 60;
  private slowFor = 0;
  private gaveUp = false;

  constructor(setting: GlowSetting = 'auto') {
    this.setting = setting;
  }

  get enabled(): boolean {
    return this.setting === 'on' || (this.setting === 'auto' && !this.gaveUp);
  }

  /** AUTO turned glow off because the device is slow. */
  get autoOff(): boolean {
    return this.setting === 'auto' && this.gaveUp;
  }

  set(setting: GlowSetting): void {
    this.setting = setting;
  }

  /** Every rendered frame: how long since the previous one (s). */
  frame(delta: number): void {
    // A hidden tab or a breakpoint is not a slow device.
    if (delta <= 0 || delta > DISPLAY.glow.ignoreAbove) return;
    this.average += (delta - this.average) * DISPLAY.glow.smoothing;
    this.slowFor = this.average > DISPLAY.glow.slowFrame ? this.slowFor + delta : 0;
    if (this.slowFor >= DISPLAY.glow.judgeSeconds) this.gaveUp = true;
  }
}

/** The game's governor (settings change it, like the palette). */
export const glow = new GlowGovernor();

/**
 * One switch for every glow the game draws: shadowBlur set on this context
 * is let through only while `on()` says so. Drawing code stays as it is.
 */
export function installGlowSwitch(ctx: CanvasRenderingContext2D, on: () => boolean): void {
  const native = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(ctx), 'shadowBlur');
  if (!native?.set || !native.get) return;
  Object.defineProperty(ctx, 'shadowBlur', {
    configurable: true,
    get: () => native.get!.call(ctx),
    set: (value: number) => native.set!.call(ctx, on() ? value : 0),
  });
}
