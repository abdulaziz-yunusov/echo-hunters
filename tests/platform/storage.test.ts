import { afterEach, describe, expect, it, vi } from 'vitest';
import { AUDIO } from '@/config/audio';
import { DISPLAY } from '@/config/display';
import { loadSave, submitScore, updateSave } from '@/platform/storage';

function fakeStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    data,
  };
}

afterEach(() => vi.unstubAllGlobals());

describe('save data', () => {
  it('starts from defaults', () => {
    vi.stubGlobal('localStorage', fakeStorage());
    expect(loadSave()).toEqual({
      version: 3,
      highScore: 0,
      audio: { muted: false, ...AUDIO.volumes },
      difficulty: 'easy',
      bindings: {},
      display: DISPLAY.defaults,
      duelBot: 'normal',
      duelBestOf: 3,
    });
  });

  it('remembers the practice bot level and series length, ignoring unknown ones', () => {
    vi.stubGlobal('localStorage', fakeStorage());
    updateSave({ duelBot: 'hard' });
    expect(loadSave().duelBot).toBe('hard');
    vi.stubGlobal(
      'localStorage',
      fakeStorage({ 'pulse-echo-hunters': JSON.stringify({ version: 3, duelBot: 'genius' }) }),
    );
    expect(loadSave().duelBot).toBe('normal');
    updateSave({ duelBestOf: 5 });
    expect(loadSave().duelBestOf).toBe(5);
    vi.stubGlobal(
      'localStorage',
      fakeStorage({ 'pulse-echo-hunters': JSON.stringify({ version: 3, duelBestOf: 4 }) }),
    );
    expect(loadSave().duelBestOf).toBe(3);
  });

  it('remembers rebound keys, keeping only valid ones', () => {
    vi.stubGlobal('localStorage', fakeStorage());
    updateSave({ bindings: { ping: ['KeyF'] } });
    expect(loadSave().bindings).toEqual({ ping: ['KeyF'] });
    vi.stubGlobal(
      'localStorage',
      fakeStorage({
        'pulse-echo-hunters': JSON.stringify({
          version: 2,
          bindings: { ping: ['KeyF'], fly: ['KeyZ'], sneak: [], shockwave: [42] },
        }),
      }),
    );
    expect(loadSave().bindings).toEqual({ ping: ['KeyF'] });
  });

  it('remembers the difficulty, and ignores unknown ones', () => {
    vi.stubGlobal('localStorage', fakeStorage());
    updateSave({ difficulty: 'hard' });
    expect(loadSave().difficulty).toBe('hard');
    vi.stubGlobal(
      'localStorage',
      fakeStorage({
        'pulse-echo-hunters': JSON.stringify({ version: 2, difficulty: 'nightmare' }),
      }),
    );
    expect(loadSave().difficulty).toBe('easy');
  });

  it('upgrades a version 1 save, keeping the high score', () => {
    vi.stubGlobal(
      'localStorage',
      fakeStorage({ 'pulse-echo-hunters': JSON.stringify({ version: 1, highScore: 4200 }) }),
    );
    const save = loadSave();
    expect(save.version).toBe(3);
    expect(save.highScore).toBe(4200);
    expect(save.audio.muted).toBe(false);
  });

  it('remembers audio settings, and ignores broken ones', () => {
    vi.stubGlobal('localStorage', fakeStorage());
    updateSave({ audio: { muted: true, master: 0.3, sfx: 1, ambient: 0.2 } });
    expect(loadSave().audio).toEqual({ muted: true, master: 0.3, sfx: 1, ambient: 0.2 });

    vi.stubGlobal(
      'localStorage',
      fakeStorage({
        'pulse-echo-hunters': JSON.stringify({ version: 2, highScore: 1, audio: { master: 7 } }),
      }),
    );
    expect(loadSave().audio).toEqual({ muted: false, ...AUDIO.volumes });
    expect(loadSave().highScore).toBe(1);
  });

  it('upgrades a version 2 save to 3: keeps everything, adds display defaults', () => {
    const audio = { muted: true, master: 0.3, sfx: 1, ambient: 0.2 };
    vi.stubGlobal(
      'localStorage',
      fakeStorage({
        'pulse-echo-hunters': JSON.stringify({
          version: 2,
          highScore: 900,
          audio,
          difficulty: 'hard',
        }),
      }),
    );
    expect(loadSave()).toMatchObject({
      version: 3,
      highScore: 900,
      audio,
      difficulty: 'hard',
      display: DISPLAY.defaults,
    });
  });

  it('remembers display settings, and replaces broken ones with defaults', () => {
    vi.stubGlobal('localStorage', fakeStorage());
    const display = { shake: 0, flash: 0.5, soundCues: true, palette: 'colorblind' as const };
    updateSave({ display });
    expect(loadSave().display).toEqual(display);

    vi.stubGlobal(
      'localStorage',
      fakeStorage({
        'pulse-echo-hunters': JSON.stringify({
          version: 3,
          display: { shake: 3, flash: 0, soundCues: 'yes', palette: 'sepia' },
        }),
      }),
    );
    expect(loadSave().display).toEqual({ ...DISPLAY.defaults, flash: 0 });
  });

  it('keeps a high score only when it is beaten', () => {
    vi.stubGlobal('localStorage', fakeStorage());
    expect(submitScore(1200)).toEqual({ highScore: 1200, isNew: true });
    expect(submitScore(800)).toEqual({ highScore: 1200, isNew: false });
    expect(loadSave().highScore).toBe(1200);
  });

  it('survives corrupted or old data', () => {
    vi.stubGlobal('localStorage', fakeStorage({ 'pulse-echo-hunters': '{not json' }));
    expect(loadSave().highScore).toBe(0);
    vi.stubGlobal(
      'localStorage',
      fakeStorage({ 'pulse-echo-hunters': JSON.stringify({ version: 0, highScore: 5 }) }),
    );
    expect(loadSave().highScore).toBe(0);
  });

  it('never throws when storage is blocked', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    });
    expect(loadSave().highScore).toBe(0);
    expect(() => updateSave({ highScore: 10 })).not.toThrow();
  });
});
