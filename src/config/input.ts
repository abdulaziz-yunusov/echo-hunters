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
  'useTool',
  'confirm',
  'click',
  'back',
  'pause',
  'toggleDebug',
  'toggleMute',
  'debugNewMap',
  'debugOverview',
  'debugWarp',
  'debugHearing',
] as const;

export type Action = (typeof ACTIONS)[number];

/** Gameplay actions the player may rebind (menus and debug keys stay fixed). */
export const REMAPPABLE = [
  'moveUp',
  'moveDown',
  'moveLeft',
  'moveRight',
  'sneak',
  'ping',
  'throwStone',
  'shockwave',
  'useTool',
] as const satisfies readonly Action[];

export type RemappableAction = (typeof REMAPPABLE)[number];

/** Names shown in the controls screen. */
export const ACTION_LABELS: Record<RemappableAction, string> = {
  moveUp: 'Move up',
  moveDown: 'Move down',
  moveLeft: 'Move left',
  moveRight: 'Move right',
  sneak: 'Sneak (hold)',
  ping: 'Sonar ping',
  throwStone: 'Throw stone',
  shockwave: 'Shockwave',
  useTool: 'Use duel tool',
};

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
  useTool: ['KeyR'],
  confirm: ['Enter', 'NumpadEnter', 'Space', 'Mouse0'],
  /** The mouse button only, so menus can tell a click (at the pointer) from Enter. */
  click: ['Mouse0'],
  back: ['Escape', 'Backspace'],
  pause: ['Escape', 'KeyP'],
  toggleDebug: ['F1', 'Backquote'],
  toggleMute: ['KeyM'],
  debugNewMap: ['KeyN'],
  debugOverview: ['KeyO'],
  debugWarp: ['KeyT'],
  debugHearing: ['KeyH'],
};
