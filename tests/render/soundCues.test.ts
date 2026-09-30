import { describe, expect, it } from 'vitest';
import type { PlayOptions } from '@/audio/soundOutput';
import { DISPLAY } from '@/config/display';
import { PALETTES, THEME } from '@/config/theme';
import { applyPalette } from '@/render/palette';
import { edgeDistance, SoundCues } from '@/render/soundCues';

const at = (dx: number, dy: number, o: Partial<PlayOptions> = {}): PlayOptions => ({
  gain: 0.5,
  pan: 0,
  muffled: false,
  pitch: 1,
  offset: { dx, dy },
  ...o,
});

describe('visual sound cues', () => {
  it('point at audible sounds, stronger when louder, fainter behind walls', () => {
    const cues = new SoundCues();
    cues.play('hunterStep', at(0, 200));
    cues.play('ping', at(-300, 0, { gain: 0.1, muffled: true }));
    const [step, ping] = cues.active;
    expect(step.angle).toBeCloseTo(Math.PI / 2, 5); // below the player (y down)
    expect(step.color).toBe('orange');
    expect(step.strength).toBe(1);
    expect(Math.abs(ping.angle)).toBeCloseTo(Math.PI, 5);
    expect(ping.strength).toBeCloseTo(0.1 / DISPLAY.soundCues.fullGain, 5);
    expect(ping.muffled).toBe(true);
  });

  it("ignore the player's own sounds, centered feedback and silent sounds", () => {
    const cues = new SoundCues();
    cues.play('step', at(0, 0));
    cues.play('ping', at(3, 4));
    cues.play('coreCollected', { ...at(0, 0), offset: null });
    cues.play('hunterStep', at(200, 0, { gain: 0 }));
    expect(cues.active).toHaveLength(0);
  });

  it('fade out after their lifetime', () => {
    const cues = new SoundCues();
    cues.play('beacon', at(500, 500));
    cues.update(DISPLAY.soundCues.life / 2);
    expect(cues.active).toHaveLength(1);
    cues.update(DISPLAY.soundCues.life / 2 + 0.01);
    expect(cues.active).toHaveLength(0);
  });
});

describe('palettes', () => {
  it('switch the colors every renderer reads, and back', () => {
    applyPalette('colorblind');
    expect(THEME.colors.orange).toBe(PALETTES.colorblind.orange);
    expect(THEME.colors.green).toBe(PALETTES.colorblind.green);
    applyPalette('standard');
    expect(THEME.colors).toEqual(PALETTES.standard);
  });
});

describe('cue placement', () => {
  it('reaches the inset screen edge along the direction from the player', () => {
    const from = { x: 100, y: 100 };
    // Right: to x = 1280 - 36.
    expect(edgeDistance(from, 0, 1280, 720, 36)).toBeCloseTo(1280 - 36 - 100, 5);
    // Down: to y = 720 - 36.
    expect(edgeDistance(from, Math.PI / 2, 1280, 720, 36)).toBeCloseTo(720 - 36 - 100, 5);
    // Up-left: the diagonal to the inset corner.
    expect(edgeDistance(from, (-3 * Math.PI) / 4, 1280, 720, 36)).toBeCloseTo(
      (100 - 36) * 2 ** 0.5,
      5,
    );
  });
});

it('keeps arcs at least the inset away when the player is at the edge', () => {
  expect(edgeDistance({ x: 10, y: 360 }, Math.PI, 1280, 720, 36)).toBe(36);
});
