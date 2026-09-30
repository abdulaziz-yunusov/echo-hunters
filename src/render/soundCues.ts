import type { SynthName } from '@/config/audio';
import { DISPLAY } from '@/config/display';
import { THEME, type ColorKey } from '@/config/theme';
import type { PlayOptions, SoundOutput } from '@/audio/soundOutput';
import type { Vec2 } from '@/core/geometry';

/** What each sound looks like as a cue. Sounds not listed get none. */
const CUE_COLORS: Partial<Record<SynthName, ColorKey>> = {
  hunterStep: 'orange',
  hunterStepMetal: 'orange',
  stepMetal: 'white',
  scream: 'red',
  shockwave: 'red',
  ping: 'cyan',
  stone: 'cyan',
  coreHum: 'cyan',
  beacon: 'green',
  wallBump: 'white',
  step: 'white',
};

export interface SoundCue {
  /** Direction from the player (radians, 0 = right, y down). */
  angle: number;
  /** 0..1 from loudness. */
  strength: number;
  muffled: boolean;
  color: ColorKey;
  age: number;
}

/**
 * Visual sound cues (Phase 15, for playing without sound): an arc at the
 * screen edge in the direction of each sound the player can hear. It is fed the
 * AudioDirector's own decisions (it is a SoundOutput), so it shows exactly
 * what headphones would play: nothing inaudible, quieter sounds fainter,
 * sounds behind walls dimmer.
 */
export class SoundCues implements SoundOutput {
  private cues: SoundCue[] = [];

  /** Cues currently shown (tests). */
  get active(): readonly SoundCue[] {
    return this.cues;
  }

  play(synth: SynthName, o: PlayOptions): void {
    const c = DISPLAY.soundCues;
    const color = CUE_COLORS[synth];
    if (!color || !o.offset || o.gain <= 0) return;
    const { dx, dy } = o.offset;
    if (Math.hypot(dx, dy) < c.minDistance) return; // the player's own sound
    this.cues.push({
      angle: Math.atan2(dy, dx),
      strength: Math.min(1, o.gain / c.fullGain),
      muffled: o.muffled,
      color,
      age: 0,
    });
  }

  setDrone(): void {}
  stopDrone(): void {}

  update(dt: number): void {
    for (const cue of this.cues) cue.age += dt;
    this.cues = this.cues.filter((cue) => cue.age < DISPLAY.soundCues.life);
  }

  clear(): void {
    this.cues = [];
  }

  /** Draw in screen (CSS) pixels; `from` is the player on screen. */
  draw(ctx: CanvasRenderingContext2D, width: number, height: number, from: Vec2): void {
    const c = DISPLAY.soundCues;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.shadowBlur = THEME.glowBlur;
    for (const cue of this.cues) {
      const fade = 1 - cue.age / c.life;
      const color = THEME.colors[cue.color];
      // An arc around the player, as far out as the screen edge allows in that direction.
      const radius = edgeDistance(from, cue.angle, width, height, c.edgeInset);
      const spread = (c.arcLength * (0.4 + 0.6 * cue.strength)) / 2 / radius;
      ctx.globalAlpha = fade * (0.35 + 0.65 * cue.strength) * (cue.muffled ? c.muffledAlpha : 1);
      ctx.strokeStyle = color;
      ctx.shadowColor = color;
      ctx.lineWidth = 2 + 3 * cue.strength;
      ctx.beginPath();
      ctx.arc(from.x, from.y, radius, cue.angle - spread, cue.angle + spread);
      ctx.stroke();
    }
    ctx.restore();
  }
}

/**
 * How far from `from` a ray at `angle` travels before it reaches the screen
 * rectangle shrunk by `inset` (at least `inset`, so arcs never collapse).
 */
export function edgeDistance(
  from: Vec2,
  angle: number,
  width: number,
  height: number,
  inset: number,
): number {
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  const tx = dx > 0 ? (width - inset - from.x) / dx : dx < 0 ? (inset - from.x) / dx : Infinity;
  const ty = dy > 0 ? (height - inset - from.y) / dy : dy < 0 ? (inset - from.y) / dy : Infinity;
  return Math.max(inset, Math.min(tx, ty));
}
