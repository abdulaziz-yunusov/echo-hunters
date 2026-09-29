import { DEFAULT_BINDINGS, REMAPPABLE, type Action, type RemappableAction } from '@/config/input';

export type Bindings = Readonly<Record<Action, readonly string[]>>;
/** What the player changed, saved as-is. Everything else keeps the defaults. */
export type BindingOverrides = Partial<Record<RemappableAction, string[]>>;

/** Defaults with the player's changes on top. */
export function withOverrides(overrides: BindingOverrides): Bindings {
  return { ...DEFAULT_BINDINGS, ...overrides };
}

/**
 * Put `input` first on `action`. If another gameplay action used that input,
 * the two swap: the other action takes over the old first input of `action`,
 * so no action is ever left without a key.
 */
export function rebind(
  overrides: BindingOverrides,
  action: RemappableAction,
  input: string,
): BindingOverrides {
  const current = withOverrides(overrides);
  const next: BindingOverrides = { ...overrides };
  const replaced = current[action][0];

  for (const other of REMAPPABLE) {
    if (other === action || !current[other].includes(input)) continue;
    next[other] = current[other].map((id) => (id === input ? replaced : id));
  }
  next[action] = [input, ...current[action].slice(1).filter((id) => id !== input)];
  return next;
}

/** Short name for a key or mouse button, for menus and prompts. */
export function inputLabel(id: string): string {
  const special: Record<string, string> = {
    Space: 'SPACE',
    ArrowUp: '↑',
    ArrowDown: '↓',
    ArrowLeft: '←',
    ArrowRight: '→',
    ShiftLeft: 'L-SHIFT',
    ShiftRight: 'R-SHIFT',
    ControlLeft: 'L-CTRL',
    ControlRight: 'R-CTRL',
    Enter: 'ENTER',
    Tab: 'TAB',
    Mouse0: 'MOUSE L',
    Mouse1: 'MOUSE M',
    Mouse2: 'MOUSE R',
  };
  if (special[id]) return special[id];
  if (id.startsWith('Key')) return id.slice(3);
  if (id.startsWith('Digit')) return id.slice(5);
  return id.toUpperCase();
}
