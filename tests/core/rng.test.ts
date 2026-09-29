import { describe, expect, it } from 'vitest';
import { createStreams, deriveSeed, hashString, Rng } from '@/core/rng';

const sequence = (rng: Rng, n = 20): number[] => Array.from({ length: n }, () => rng.next());

describe('Rng', () => {
  it('is deterministic for the same seed', () => {
    expect(sequence(new Rng(1234))).toEqual(sequence(new Rng(1234)));
  });

  it('differs for different seeds', () => {
    expect(sequence(new Rng(1))).not.toEqual(sequence(new Rng(2)));
  });

  it('matches the reference mulberry32 output (guards against accidental changes)', () => {
    const rng = new Rng(42);
    expect(rng.next()).toBeCloseTo(0.6011037519201636, 12);
    expect(rng.next()).toBeCloseTo(0.44829055899754167, 12);
  });

  it('next() stays in [0, 1)', () => {
    const rng = new Rng(7);
    for (let i = 0; i < 10_000; i++) {
      const v = rng.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('int() is inclusive at both ends and covers the range', () => {
    const rng = new Rng(99);
    const seen = new Set<number>();
    for (let i = 0; i < 2_000; i++) {
      const v = rng.int(3, 7);
      expect(v).toBeGreaterThanOrEqual(3);
      expect(v).toBeLessThanOrEqual(7);
      seen.add(v);
    }
    expect([...seen].sort()).toEqual([3, 4, 5, 6, 7]);
  });

  it('shuffle() keeps every element', () => {
    const items = Array.from({ length: 50 }, (_, i) => i);
    const shuffled = new Rng(5).shuffle([...items]);
    expect(shuffled).not.toEqual(items);
    expect([...shuffled].sort((a, b) => a - b)).toEqual(items);
  });

  it('pick() throws on an empty array', () => {
    expect(() => new Rng(1).pick([])).toThrow();
  });

  it('state can be saved and restored exactly', () => {
    const rng = new Rng(2024);
    sequence(rng, 5);
    const saved = rng.state;
    const expected = sequence(rng, 10);
    rng.state = saved;
    expect(sequence(rng, 10)).toEqual(expected);
  });
});

describe('seed helpers', () => {
  it('hashString is stable', () => {
    expect(hashString('')).toBe(0x811c9dc5);
    expect(hashString('map')).toBe(hashString('map'));
    expect(hashString('map')).not.toBe(hashString('ai'));
  });

  it('named streams are reproducible and independent', () => {
    const a = createStreams(77, ['map', 'ai']);
    const b = createStreams(77, ['map', 'ai']);
    expect(sequence(a.map)).toEqual(sequence(b.map));
    expect(sequence(createStreams(77, ['map']).map)).not.toEqual(
      sequence(createStreams(77, ['ai']).ai),
    );
  });

  it('using one stream does not change another', () => {
    const quiet = createStreams(10, ['map', 'ai']);
    const busy = createStreams(10, ['map', 'ai']);
    sequence(busy.ai, 500);
    expect(sequence(busy.map)).toEqual(sequence(quiet.map));
  });

  it('deriveSeed spreads nearby seeds apart', () => {
    expect(deriveSeed(1, 'map')).not.toBe(deriveSeed(2, 'map'));
    expect(deriveSeed(1, 'map')).not.toBe(deriveSeed(1, 'ai'));
  });
});
