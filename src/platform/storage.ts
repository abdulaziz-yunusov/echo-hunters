import { AUDIO } from '@/config/audio';
import { DEFAULT_DIFFICULTY, DIFFICULTIES, type DifficultyId } from '@/config/difficulty';
import { DISPLAY, GLOW_SETTINGS, type DisplaySettings } from '@/config/display';
import { DEFAULT_VARIANT_CHOICE, VARIANT_CHOICES, type VariantChoice } from '@/config/duel';
import { GAME } from '@/config/game';
import { DEFAULT_DUEL_BOT, DUEL_BOTS, type DuelBotId } from '@/config/duelBots';
import { PALETTES } from '@/config/theme';
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
  version: 3;
  highScore: number;
  audio: AudioSettings;
  /** Last difficulty picked in the menu. */
  difficulty: DifficultyId;
  /** Keys the player rebound (the rest use the defaults). */
  bindings: BindingOverrides;
  /** Shake, flashes, sound cues, colors (v3). */
  display: DisplaySettings;
  /** Last practice bot level picked in the duel lobby. */
  duelBot: DuelBotId;
  /** Last series length (best of N) a host picked in the duel lobby. */
  duelBestOf: number;
  /** Last arena variant (or RANDOM) picked in the duel lobby (Phase 30). */
  duelVariant: VariantChoice;
  /** Best Daily Seed score (Phase 13), for that day only. */
  dailyBest: { date: string; score: number } | null;
}

const KEY = 'pulse-echo-hunters';

function defaults(): SaveData {
  return {
    version: 3,
    highScore: 0,
    audio: { muted: false, ...AUDIO.volumes },
    difficulty: DEFAULT_DIFFICULTY,
    bindings: {},
    display: { ...DISPLAY.defaults },
    duelBot: DEFAULT_DUEL_BOT,
    duelBestOf: GAME.duel.series.defaultBestOf,
    duelVariant: DEFAULT_VARIANT_CHOICE,
    dailyBest: null,
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

/** Record a Daily Seed run's score (Phase 13). Returns that day's best and whether this beat it. */
export function submitDaily(date: string, score: number): { best: number; isNew: boolean } {
  const { dailyBest } = loadSave();
  const before = dailyBest?.date === date ? dailyBest.score : -1;
  if (score <= before) return { best: before, isNew: false };
  updateSave({ dailyBest: { date, score } });
  return { best: score, isNew: true };
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
  // v1 had only the high score; v2 adds audio settings; v3 display settings.
  if (data.version !== 1 && data.version !== 2 && data.version !== 3) return result;
  if (typeof highScore === 'number') result.highScore = highScore;
  if (data.version !== 1 && isAudioSettings(data.audio)) result.audio = data.audio;
  if (typeof data.difficulty === 'string' && data.difficulty in DIFFICULTIES) {
    result.difficulty = data.difficulty as DifficultyId;
  }
  if (typeof data.duelBot === 'string' && data.duelBot in DUEL_BOTS) {
    result.duelBot = data.duelBot as DuelBotId;
  }
  if ((GAME.duel.series.bestOf as readonly unknown[]).includes(data.duelBestOf)) {
    result.duelBestOf = data.duelBestOf as number;
  }
  if ((VARIANT_CHOICES as readonly unknown[]).includes(data.duelVariant)) {
    result.duelVariant = data.duelVariant as VariantChoice;
  }
  const daily = data.dailyBest as { date?: unknown; score?: unknown } | null | undefined;
  if (daily && typeof daily.date === 'string' && typeof daily.score === 'number') {
    result.dailyBest = { date: daily.date, score: daily.score };
  }
  result.bindings = validBindings(data.bindings);
  result.display = validDisplay(data.display);
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

/** Each display setting is kept if valid, otherwise it falls back to its default. */
function validDisplay(value: unknown): DisplaySettings {
  const result = { ...DISPLAY.defaults };
  if (typeof value !== 'object' || value === null) return result;
  const d = value as Record<string, unknown>;
  const level = (v: unknown) => typeof v === 'number' && v >= 0 && v <= 1;
  if (level(d.shake)) result.shake = d.shake as number;
  if (level(d.flash)) result.flash = d.flash as number;
  if (typeof d.soundCues === 'boolean') result.soundCues = d.soundCues;
  if (typeof d.ghost === 'boolean') result.ghost = d.ghost;
  if ((GLOW_SETTINGS as readonly unknown[]).includes(d.glow)) {
    result.glow = d.glow as DisplaySettings['glow'];
  }
  if (typeof d.palette === 'string' && d.palette in PALETTES) {
    result.palette = d.palette as DisplaySettings['palette'];
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
