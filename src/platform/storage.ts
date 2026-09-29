import { AUDIO } from '@/config/audio';
import { DEFAULT_DIFFICULTY, DIFFICULTIES, type DifficultyId } from '@/config/difficulty';
import { REMAPPABLE } from '@/config/input';
import type { BindingOverrides } from '@/input/bindings';

export interface AudioSettings {
  muted: boolean;
  /** 0..1 */
  master: number;
  sfx: number;
  ambient: number;
}

/** Everything the game remembers between sessions. Bump `version` when the shape changes. */
export interface SaveData {
  version: 2;
  highScore: number;
  audio: AudioSettings;
  /** Last difficulty picked in the menu. */
  difficulty: DifficultyId;
  /** Keys the player rebound (the rest use the defaults). */
  bindings: BindingOverrides;
}

const KEY = 'pulse-echo-hunters';

function defaults(): SaveData {
  return {
    version: 2,
    highScore: 0,
    audio: { muted: false, ...AUDIO.volumes },
    difficulty: DEFAULT_DIFFICULTY,
    bindings: {},
  };
}

/**
 * Saved data from localStorage. Never throws: private windows, blocked
 * storage or a corrupted value just give the defaults. Older versions are
 * upgraded, keeping what they had.
 */
export function loadSave(): SaveData {
  try {
    const raw = globalThis.localStorage?.getItem(KEY);
    if (!raw) return defaults();
    return migrate(JSON.parse(raw) as Record<string, unknown>);
  } catch {
    return defaults();
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

function migrate(data: Record<string, unknown>): SaveData {
  const result = defaults();
  const highScore = data.highScore;
  // v1 had only the high score; v2 adds audio settings.
  if (data.version !== 1 && data.version !== 2) return result;
  if (typeof highScore === 'number') result.highScore = highScore;
  if (data.version === 2 && isAudioSettings(data.audio)) result.audio = data.audio;
  if (typeof data.difficulty === 'string' && data.difficulty in DIFFICULTIES) {
    result.difficulty = data.difficulty as DifficultyId;
  }
  result.bindings = validBindings(data.bindings);
  return result;
}

/** Keep only rebinds of known actions to non-empty lists of input ids. */
function validBindings(value: unknown): BindingOverrides {
  const result: BindingOverrides = {};
  if (typeof value !== 'object' || value === null) return result;
  for (const action of REMAPPABLE) {
    const inputs = (value as Record<string, unknown>)[action];
    if (Array.isArray(inputs) && inputs.length > 0 && inputs.every((i) => typeof i === 'string')) {
      result[action] = inputs as string[];
    }
  }
  return result;
}

function isAudioSettings(value: unknown): value is AudioSettings {
  const a = value as AudioSettings | null;
  return (
    typeof a === 'object' &&
    a !== null &&
    typeof a.muted === 'boolean' &&
    [a.master, a.sfx, a.ambient].every((v) => typeof v === 'number' && v >= 0 && v <= 1)
  );
}
