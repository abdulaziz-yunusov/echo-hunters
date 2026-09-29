/** Everything the game remembers between sessions. Bump `version` when the shape changes. */
export interface SaveData {
  version: 1;
  highScore: number;
}

const KEY = 'pulse-echo-hunters';
const DEFAULTS: SaveData = { version: 1, highScore: 0 };

/**
 * Saved data from localStorage. Never throws: private windows, blocked
 * storage or a corrupted value just give the defaults.
 */
export function loadSave(): SaveData {
  try {
    const raw = globalThis.localStorage?.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    const data = JSON.parse(raw) as Partial<SaveData>;
    if (data.version !== DEFAULTS.version) return { ...DEFAULTS };
    return {
      ...DEFAULTS,
      highScore: typeof data.highScore === 'number' ? data.highScore : 0,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

/** Merge changes into the save. Returns the new data; storage errors are ignored. */
export function updateSave(changes: Partial<Omit<SaveData, 'version'>>): SaveData {
  const next = { ...loadSave(), ...changes };
  try {
    globalThis.localStorage?.setItem(KEY, JSON.stringify(next));
  } catch {
    // Storage full or blocked: the game still works, it just won't remember.
  }
  return next;
}

/** Record a run score. Returns the high score and whether this beat it. */
export function submitScore(score: number): { highScore: number; isNew: boolean } {
  const { highScore } = loadSave();
  if (score <= highScore) return { highScore, isNew: false };
  updateSave({ highScore: score });
  return { highScore: score, isNew: true };
}
