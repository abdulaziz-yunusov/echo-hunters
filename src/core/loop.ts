export interface FixedLoopOptions {
  /** Seconds per simulation tick. */
  step: number;
  /** Most real time processed in one frame (s); the rest is dropped. */
  maxFrameDelta: number;
  update(dt: number): void;
  /**
   * @param alpha how far (0..1) real time is between the last tick and the next;
   *   used to draw positions smoothly between ticks.
   * @param frameDelta real seconds since the previous frame (after clamping).
   */
  render(alpha: number, frameDelta: number): void;
}

/** Guards against float drift dropping a tick when a frame is exactly one step long. */
const EPSILON = 1e-9;

/**
 * Fixed-timestep game loop. The simulation always advances in equal steps,
 * whatever the monitor refresh rate, so speeds and physics are stable and
 * replayable. Time is pushed in from outside (platform/frameDriver.ts), which
 * keeps this class pure and testable.
 */
export class FixedLoop {
  private readonly options: FixedLoopOptions;
  private accumulator = 0;
  private lastTime: number | null = null;
  private tickCount = 0;

  constructor(options: FixedLoopOptions) {
    this.options = options;
  }

  /** Total simulation ticks run so far. */
  get ticks(): number {
    return this.tickCount;
  }

  /** Advance to `now` (seconds, any monotonic clock): run due ticks, then render once. */
  frame(now: number): void {
    const { step, maxFrameDelta } = this.options;
    const delta =
      this.lastTime === null ? 0 : Math.min(Math.max(now - this.lastTime, 0), maxFrameDelta);
    this.lastTime = now;
    this.accumulator += delta;

    while (this.accumulator >= step - EPSILON) {
      this.options.update(step);
      this.accumulator -= step;
      this.tickCount++;
    }

    const alpha = Math.min(Math.max(this.accumulator / step, 0), 1);
    this.options.render(alpha, delta);
  }

  /** Forget the last frame time, e.g. after the tab was hidden, so no time jump is simulated. */
  reset(): void {
    this.lastTime = null;
    this.accumulator = 0;
  }
}
