import { THEME, type ColorKey } from '@/config/theme';

interface Flash {
  x: number;
  y: number;
  color: ColorKey;
  /** Real seconds since it started. */
  age: number;
  duration: number;
  radius: number;
}

/**
 * Short visual effects that are not sounds: they reveal nothing and no
 * hunter hears them (e.g. the flash of picking up a core). Screen shake joins in Phase 6.
 */
export class Effects {
  private flashes: Flash[] = [];

  flash(x: number, y: number, color: ColorKey, radius = 26, duration = 0.45): void {
    this.flashes.push({ x, y, color, age: 0, duration, radius });
  }

  update(dt: number): void {
    for (const f of this.flashes) f.age += dt;
    this.flashes = this.flashes.filter((f) => f.age < f.duration);
  }

  /** Draw in world space. */
  draw(ctx: CanvasRenderingContext2D, pixel: number): void {
    ctx.save();
    ctx.lineWidth = 2 * pixel;
    for (const f of this.flashes) {
      const t = f.age / f.duration;
      const color = THEME.colors[f.color];
      ctx.globalAlpha = 1 - t;
      ctx.strokeStyle = color;
      ctx.shadowColor = color;
      ctx.shadowBlur = THEME.glowBlur;
      ctx.beginPath();
      ctx.arc(f.x, f.y, f.radius * (0.3 + 0.7 * t), 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }
}
