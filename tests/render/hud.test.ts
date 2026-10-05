import { describe, expect, it } from 'vitest';
import { drawHud } from '@/render/hud';
import { createDuelSimulation } from '@/sim/simulation';

/** A canvas that records where text goes; every character is 8 px wide. */
function recordingCtx() {
  const texts: { text: string; x: number; y: number }[] = [];
  const ctx = new Proxy({} as Record<string | symbol, unknown>, {
    get: (target, prop) => {
      if (prop in target) return target[prop];
      if (prop === 'measureText') return (t: string) => ({ width: t.length * 8 });
      if (prop === 'fillText')
        return (t: string, x: number, y: number) => texts.push({ text: t, x, y });
      return () => {};
    },
    set: (target, prop, value) => {
      target[prop] = value;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
  return { ctx, texts };
}

describe('HUD on narrow screens (Phase 12)', () => {
  it('wraps onto more rows instead of running off the edge', () => {
    const state = createDuelSimulation({ seed: 1, role: 'host' }).state;
    const wide = recordingCtx();
    drawHud(wide.ctx, state);
    expect(new Set(wide.texts.map((t) => t.y)).size).toBe(1); // one row on a wide screen

    const narrow = recordingCtx();
    const maxX = 300;
    drawHud(narrow.ctx, state, maxX);
    const rows = new Set(narrow.texts.map((t) => t.y));
    expect(rows.size).toBeGreaterThan(1);
    for (const t of narrow.texts) {
      expect(t.x + t.text.length * 8, t.text).toBeLessThanOrEqual(maxX + 0.5);
    }
  });
});
