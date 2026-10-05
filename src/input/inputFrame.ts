/**
 * Everything the input devices said during one simulation tick. Plain data,
 * so it can be sent over the network or recorded for replays.
 */
export interface InputFrame {
  /** Movement direction. Length 0..1: keyboard gives 0 or 1, a joystick anything between. */
  moveX: number;
  moveY: number;

  /**
   * Menu navigation: -1 / 1 for a left / right press this tick, else 0. Latched
   * like other presses, so a tap shorter than one tick still counts once.
   */
  navX: number;
  /** Menu navigation: -1 / 1 for an up / down press this tick, else 0. */
  navY: number;

  /** Held for as long as the button is down. */
  sneak: boolean;
  /** The ping key is down (a press also sets `ping` for one tick). */
  pingHeld: boolean;

  /** Pressed this tick: true for exactly one tick per press. */
  ping: boolean;
  throwStone: boolean;
  shockwave: boolean;
  /** Duel tool (Phase 29), pressed this tick. */
  useTool: boolean;
  confirm: boolean;
  /** Mouse button pressed this tick (also sets confirm); menus use it with `aim`. */
  click: boolean;
  back: boolean;
  pause: boolean;
  toggleDebug: boolean;
  toggleMute: boolean;
  debugNewMap: boolean;
  debugOverview: boolean;
  debugWarp: boolean;
  debugDrop: boolean;
  debugHearing: boolean;

  /** Pointer position in screen CSS pixels, or null until the pointer has been seen. */
  aim: Readonly<{ x: number; y: number }> | null;
}

export const EMPTY_INPUT: Readonly<InputFrame> = {
  moveX: 0,
  moveY: 0,
  navX: 0,
  navY: 0,
  sneak: false,
  pingHeld: false,
  ping: false,
  throwStone: false,
  shockwave: false,
  useTool: false,
  confirm: false,
  click: false,
  back: false,
  pause: false,
  toggleDebug: false,
  toggleMute: false,
  debugNewMap: false,
  debugOverview: false,
  debugWarp: false,
  debugDrop: false,
  debugHearing: false,
  aim: null,
};
