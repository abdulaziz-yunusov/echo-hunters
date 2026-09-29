/** Everything the player can ask for. Game code reads actions, never raw keys. */
export const ACTIONS = [
  'moveUp',
  'moveDown',
  'moveLeft',
  'moveRight',
  'sneak',
  'ping',
  'throwStone',
  'shockwave',
  'confirm',
  'back',
  'pause',
  'toggleDebug',
  'debugNewMap',
  'debugOverview',
  'debugWarp',
  'debugHearing',
] as const;

export type Action = (typeof ACTIONS)[number];

/**
 * Default bindings (GDD §3). Keys use KeyboardEvent.code, which is the
 * physical key position, so WASD stays in place on AZERTY or Cyrillic
 * layouts. Mouse buttons are 'Mouse0' (left), 'Mouse1' (middle), 'Mouse2' (right).
 * One input may drive several actions; each scene reads the ones it cares about.
 */
export const DEFAULT_BINDINGS: Readonly<Record<Action, readonly string[]>> = {
  moveUp: ['KeyW', 'ArrowUp'],
  moveDown: ['KeyS', 'ArrowDown'],
  moveLeft: ['KeyA', 'ArrowLeft'],
  moveRight: ['KeyD', 'ArrowRight'],
  sneak: ['ShiftLeft', 'ShiftRight'],
  ping: ['Space'],
  throwStone: ['KeyQ'],
  shockwave: ['Mouse0', 'KeyE'],
  confirm: ['Enter', 'NumpadEnter', 'Space', 'Mouse0'],
  back: ['Escape', 'Backspace'],
  pause: ['Escape', 'KeyP'],
  toggleDebug: ['F1', 'Backquote'],
  debugNewMap: ['KeyN'],
  debugOverview: ['KeyM'],
  debugWarp: ['KeyT'],
  debugHearing: ['KeyH'],
};
