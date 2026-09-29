/**
 * Keeps the canvas backing store matched to its CSS size and devicePixelRatio,
 * and works out the world scale: `viewSize` world pixels always fit the
 * shorter screen side, whatever the device.
 *
 * All drawing after beginFrame() uses CSS pixels; multiply by worldScale
 * (or let the camera do it) to draw in world pixels.
 */
export class Viewport {
  /** Canvas size in CSS pixels. */
  width = 0;
  height = 0;
  dpr = 1;
  /** CSS pixels per world pixel. */
  worldScale = 1;

  private readonly canvas: HTMLCanvasElement;
  private readonly viewSize: number;
  private readonly maxDpr: number;
  private readonly listeners = new Set<() => void>();
  private readonly observer: ResizeObserver;

  constructor(canvas: HTMLCanvasElement, viewSize: number, maxDpr: number) {
    this.canvas = canvas;
    this.viewSize = viewSize;
    this.maxDpr = maxDpr;
    // ResizeObserver also catches mobile URL-bar and orientation changes.
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(canvas);
    this.resize();
  }

  /** World pixels visible horizontally. */
  get worldWidth(): number {
    return this.width / this.worldScale;
  }

  /** World pixels visible vertically. */
  get worldHeight(): number {
    return this.height / this.worldScale;
  }

  /** Subscribe to size changes. Returns an unsubscribe function. */
  onResize(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Clear the frame and set a CSS-pixel transform. Call once at the start of each render. */
  beginFrame(ctx: CanvasRenderingContext2D, background: string): void {
    // Moving the window to another monitor changes DPR without a resize event.
    if (this.currentDpr() !== this.dpr) this.resize();
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, this.width, this.height);
  }

  dispose(): void {
    this.observer.disconnect();
    this.listeners.clear();
  }

  private currentDpr(): number {
    return Math.min(window.devicePixelRatio || 1, this.maxDpr);
  }

  private resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    this.width = Math.max(1, rect.width);
    this.height = Math.max(1, rect.height);
    this.dpr = this.currentDpr();
    this.canvas.width = Math.round(this.width * this.dpr);
    this.canvas.height = Math.round(this.height * this.dpr);
    this.worldScale = Math.min(this.width, this.height) / this.viewSize;
    for (const listener of this.listeners) listener();
  }
}
