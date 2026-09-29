import { afterEach, describe, expect, it, vi } from 'vitest';
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
    expect(loadSave()).toEqual({ version: 1, highScore: 0 });
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
