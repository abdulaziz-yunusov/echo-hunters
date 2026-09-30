/** Color names, as used by sound kinds and renderers (see sounds.ts). */
type ColorName = 'dim' | 'white' | 'cyan' | 'red' | 'orange' | 'green';

/**
 * Color palettes. Keys are named after the standard look; the colorblind
 * palette swaps what they show (Phase 15, measured in DECISIONS.md):
 * hunter footsteps purple instead of orange, the beacon gold instead of
 * green, so every pair that means something stays apart under protanopia,
 * deuteranopia and tritanopia.
 */
export const PALETTES = {
  standard: {
    dim: 'rgba(255, 255, 255, 0.45)',
    white: '#ffffff',
    cyan: '#00e5ff',
    red: '#ff2a4a',
    orange: '#ff9a2a',
    green: '#39ff88',
  },
  colorblind: {
    dim: 'rgba(255, 255, 255, 0.45)',
    white: '#ffffff',
    cyan: '#00e5ff',
    red: '#ff2a4a',
    orange: '#c050ff',
    green: '#ffd400',
  },
} as const satisfies Record<string, Record<ColorName, string>>;

export type PaletteId = keyof typeof PALETTES;

/**
 * Visual constants. Sound kinds refer to colors by key (see sounds.ts).
 * `colors` holds the active palette (render/palette.ts switches it).
 */
export const THEME = {
  background: '#000000',
  font: '"Consolas", "Menlo", "Courier New", monospace',
  glowBlur: 12,
  colors: { ...PALETTES.standard } as Record<ColorName, string>,
  wall: '#bff6ff',
  /** Floor patterns (Phase 16): grates and moss differ by pattern too, not only color. */
  surfaces: { metal: '#a6c8da', soft: '#7cc592' },
  player: { color: '#ffffff', auraRadius: 20 },
  hunterSilhouette: '#ff2a4a',
  /** Silhouette spikes per hunter type, so each kind is recognisable at a glance. */
  hunterShapes: {
    stalker: { spikes: 11, outer: 15, inner: 8 },
    sprinter: { spikes: 6, outer: 18, inner: 6 },
    listener: { spikes: 18, outer: 15, inner: 12 },
  },
  /** Screen shake: peak offset (CSS px) and length (s). */
  shake: {
    hit: { strength: 7, duration: 0.35 },
    shockwave: { strength: 4, duration: 0.25 },
  },
} as const;

export type ColorKey = ColorName;
