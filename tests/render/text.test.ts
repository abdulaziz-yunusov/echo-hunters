import { describe, expect, it } from 'vitest';
import { wrapLines } from '@/render/text';

/** Every character 10 px wide. */
const ctx = { measureText: (t: string) => ({ width: t.length * 10 }) } as CanvasRenderingContext2D;

describe('wrapLines (Phase 12)', () => {
  it('keeps short text on one line and breaks long text at spaces', () => {
    expect(wrapLines(ctx, 'hold PING', 200)).toEqual(['hold PING']);
    const lines = wrapLines(ctx, 'Hunters are blind but hear everything', 120);
    expect(lines).toEqual(['Hunters are', 'blind but', 'hear', 'everything']);
    for (const l of lines) expect(l.length * 10).toBeLessThanOrEqual(120);
  });

  it('gives an over-long word a line of its own instead of looping', () => {
    expect(wrapLines(ctx, 'a extraordinarily b', 50)).toEqual(['a', 'extraordinarily', 'b']);
  });
});
