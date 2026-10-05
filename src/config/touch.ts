import type { Action } from './input';

/** Which on-screen controls a scene wants (Phase 12): solo play, or a duel (adds TOOL). */
export type TouchMode = 'solo' | 'duel';

export interface TouchButtonDef {
  id: string;
  label: string;
  /** What holding it does. */
  action: Action;
  /** Centre, from the right and bottom edges (CSS px); radius. */
  right: number;
  bottom: number;
  radius: number;
  /** Shown only in these modes (default: all). */
  modes?: readonly TouchMode[];
}

/**
 * On-screen touch controls (Phase 12). Sizes are CSS pixels: a finger is
 * the same size on every screen.
 */
export const TOUCH = {
  joystick: {
    /** Touches starting in this share of the screen width (from the left) steer. */
    zoneWidth: 0.45,
    /** How far the knob travels (px). */
    radius: 56,
    /** Pushes shorter than this share of the radius do nothing. */
    deadzone: 0.18,
    /** A light push (under this share) sneaks; further walks (GDD §3). */
    sneakBelow: 0.6,
    /** Where the faint resting joystick is drawn, from the left and bottom (px). */
    restLeft: 110,
    restBottom: 120,
  },
  buttons: [
    // A: tap to ping, hold to charge a beam (Phase 18).
    { id: 'ping', label: 'PING', action: 'ping', right: 96, bottom: 104, radius: 44 },
    // B: the stone flies the way you face.
    { id: 'stone', label: 'STONE', action: 'throwStone', right: 196, bottom: 64, radius: 32 },
    // C: shockwave.
    { id: 'shock', label: 'SHOCK', action: 'shockwave', right: 60, bottom: 212, radius: 32 },
    // Duel tools (Phase 29).
    {
      id: 'tool',
      label: 'TOOL',
      action: 'useTool',
      right: 172,
      bottom: 176,
      radius: 28,
      modes: ['duel'],
    },
    // Top right: the pause / duel menu.
    { id: 'pause', label: 'II', action: 'pause', right: 34, bottom: -1, radius: 22 },
  ] as readonly TouchButtonDef[],
  /** The pause button sits this far below the top edge (its `bottom` is ignored). */
  pauseTop: 64,
  /** Extra reach around each button for fat fingers (px). */
  slop: 10,
} as const;
