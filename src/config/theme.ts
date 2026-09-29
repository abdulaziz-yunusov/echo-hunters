/** Visual constants. Sound kinds refer to colors by key (see sounds.ts). */
export const THEME = {
  background: '#000000',
  font: '"Consolas", "Menlo", "Courier New", monospace',
  glowBlur: 12,
  colors: {
    dim: 'rgba(255, 255, 255, 0.45)',
    white: '#ffffff',
    cyan: '#00e5ff',
    red: '#ff2a4a',
    orange: '#ff9a2a',
    green: '#39ff88',
  },
  wall: '#bff6ff',
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

export type ColorKey = keyof typeof THEME.colors;
