import type { PaletteId } from './theme';

/** Accessibility and comfort settings (Phase 15). The player's choices are saved. */
export interface DisplaySettings {
  /** Screen shake strength, 0..1. */
  shake: number;
  /** Brightness of hit / pickup / stun flashes, 0..1. */
  flash: number;
  /** Arcs showing where heard sounds come from (for playing without sound). */
  soundCues: boolean;
  palette: PaletteId;
}

export const DISPLAY = {
  defaults: { shake: 1, flash: 1, soundCues: false, palette: 'standard' } as DisplaySettings,
  /** Steps offered for shake and flash strength. */
  levels: [0, 0.5, 1],

  /**
   * Visual sound cues: an arc near the screen edge, where the line from the
   * player toward the sound leaves the screen.
   */
  soundCues: {
    /** Distance of the arcs from the screen edge (CSS px). */
    edgeInset: 36,
    /** Seconds a cue stays visible. */
    life: 0.7,
    /** Sounds closer than this are the player's own (px). */
    minDistance: 24,
    /** Arc length at full loudness (CSS px); quiet sounds get shorter arcs. */
    arcLength: 80,
    /** Loudness to opacity: a sound this loud (0..1 gain) is fully opaque. */
    fullGain: 0.5,
    /** Sounds behind walls are drawn this much fainter. */
    muffledAlpha: 0.5,
  },
};
