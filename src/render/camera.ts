import type { Bounds, Vec2 } from '@/core/geometry';
import type { Viewport } from '@/platform/viewport';

/**
 * Follows a point in the world and converts between screen and world
 * coordinates, and shakes the view on impacts.
 */
export class Camera {
  /** World point shown at the center of the screen. */
  x = 0;
  y = 0;
  private readonly viewport: Viewport;
  private shakeStrength = 0;
  private shakeDuration = 0;
  private shakeLeft = 0;

  constructor(viewport: Viewport) {
    this.viewport = viewport;
  }

  /** Size of one screen (CSS) pixel in world units, for line widths. */
  get pixel(): number {
    return 1 / this.viewport.worldScale;
  }

  /** Center on a point without showing outside the map; a map smaller than the view is centered. */
  follow(targetX: number, targetY: number, worldWidth: number, worldHeight: number): void {
    this.x = clampCenter(targetX, this.viewport.worldWidth, worldWidth);
    this.y = clampCenter(targetY, this.viewport.worldHeight, worldHeight);
  }

  /** Shake the view (screen pixels), fading out over `duration` seconds. Stronger shakes win. */
  shake(strength: number, duration: number): void {
    if (this.currentShake() > strength) return;
    this.shakeStrength = strength;
    this.shakeDuration = duration;
    this.shakeLeft = duration;
  }

  /** Advance effects such as shake (s). */
  update(dt: number): void {
    this.shakeLeft = Math.max(0, this.shakeLeft - dt);
  }

  /** Switch ctx from CSS pixels to world pixels. Wrap in save()/restore(). */
  apply(ctx: CanvasRenderingContext2D): void {
    const { width, height, worldScale, dpr } = this.viewport;
    // Snap to whole device pixels so thin lines don't shimmer while scrolling.
    const snap = (v: number) => Math.round(v * dpr) / dpr;
    const amount = this.currentShake();
    // Visual only, so plain Math.random is fine here (the simulation never sees it).
    const sx = (Math.random() * 2 - 1) * amount;
    const sy = (Math.random() * 2 - 1) * amount;
    ctx.translate(
      snap(width / 2 - this.x * worldScale + sx),
      snap(height / 2 - this.y * worldScale + sy),
    );
    ctx.scale(worldScale, worldScale);
  }

  /** How strong the shake is right now (it fades linearly to 0). */
  private currentShake(): number {
    return this.shakeDuration > 0 ? this.shakeStrength * (this.shakeLeft / this.shakeDuration) : 0;
  }

  /** World area currently on screen, for culling. */
  visibleBounds(): Bounds {
    const halfW = this.viewport.worldWidth / 2;
    const halfH = this.viewport.worldHeight / 2;
    return {
      minX: this.x - halfW,
      minY: this.y - halfH,
      maxX: this.x + halfW,
      maxY: this.y + halfH,
    };
  }

  screenToWorld(sx: number, sy: number): Vec2 {
    const { width, height, worldScale } = this.viewport;
    return {
      x: (sx - width / 2) / worldScale + this.x,
      y: (sy - height / 2) / worldScale + this.y,
    };
  }
}

function clampCenter(target: number, view: number, world: number): number {
  if (view >= world) return world / 2;
  return Math.min(Math.max(target, view / 2), world - view / 2);
}
