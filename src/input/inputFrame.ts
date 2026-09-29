/**
 * Everything the input devices said during one simulation tick. Plain data,
 * so it can be sent over the network or recorded for replays.
 */
export interface InputFrame {
  /** Movement direction. Length 0..1: keyboard gives 0 or 1, a joystick anything between. */
  moveX: number;
  moveY: number;

  /** Held for as long as the button is down. */
  sneak: boolean;

  /** Pressed this tick: true for exactly one tick per press. */
  ping: boolean;
  throwStone: boolean;
  shockwave: boolean;
  confirm: boolean;
  back: boolean;
  pause: boolean;
  toggleDebug: boolean;
  debugNewMap: boolean;
  debugOverview: boolean;
  debugWarp: boolean;
  debugHearing: boolean;

  /** Pointer position in screen CSS pixels, or null until the pointer has been seen. */
  aim: Readonly<{ x: number; y: number }> | null;
}

export const EMPTY_INPUT: Readonly<InputFrame> = {
  moveX: 0,
  moveY: 0,
  sneak: false,
  ping: false,
  throwStone: false,
  shockwave: false,
  confirm: false,
  back: false,
  pause: false,
  toggleDebug: false,
  debugNewMap: false,
  debugOverview: false,
  debugWarp: false,
  debugHearing: false,
  aim: null,
};
