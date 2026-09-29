import { describe, expect, it } from 'vitest';
import { distanceGain, proximity, stereoPan } from '@/audio/mix';

describe('mix math', () => {
  it('pans by side, saturating at the pan range', () => {
    expect(stereoPan(0, 320)).toBe(0);
    expect(stereoPan(-160, 320)).toBe(-0.5);
    expect(stereoPan(160, 320)).toBe(0.5);
    expect(stereoPan(9999, 320)).toBe(1);
    expect(stereoPan(-9999, 320)).toBe(-1);
  });

  it('gets quieter with distance, silent at the range', () => {
    expect(distanceGain(0, 400)).toBe(1);
    expect(distanceGain(100, 400)).toBeGreaterThan(distanceGain(200, 400));
    expect(distanceGain(400, 400)).toBe(0);
    expect(distanceGain(1000, 400)).toBe(0);
  });

  it('proximity rises from 0 to 1 as a hunter closes in', () => {
    expect(proximity(null, 150)).toBe(0);
    expect(proximity(150, 150)).toBe(0);
    expect(proximity(75, 150)).toBe(0.5);
    expect(proximity(0, 150)).toBe(1);
  });
});
