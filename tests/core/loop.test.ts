import { describe, expect, it } from 'vitest';
import { FixedLoop } from '@/core/loop';

const STEP = 1 / 60;

function run(frameRate: number, seconds: number, maxFrameDelta = 0.25) {
  let ticks = 0;
  let simTime = 0;
  const alphas: number[] = [];
  const loop = new FixedLoop({
    step: STEP,
    maxFrameDelta,
    update: (dt) => {
      ticks++;
      simTime += dt;
    },
    render: (alpha) => alphas.push(alpha),
  });
  const frames = Math.round(frameRate * seconds);
  for (let i = 0; i <= frames; i++) loop.frame(i / frameRate);
  return { ticks, simTime, alphas, loop };
}

describe('FixedLoop', () => {
  it.each([30, 60, 75, 120, 144, 240])('runs 60 ticks per second of real time at %i fps', (fps) => {
    const { ticks, simTime } = run(fps, 2);
    expect(ticks).toBeGreaterThanOrEqual(119);
    expect(ticks).toBeLessThanOrEqual(120);
    expect(simTime).toBeCloseTo(ticks * STEP, 9);
  });

  it('renders once per frame with alpha in [0, 1]', () => {
    const { alphas } = run(144, 1);
    expect(alphas).toHaveLength(145);
    for (const a of alphas) {
      expect(a).toBeGreaterThanOrEqual(0);
      expect(a).toBeLessThanOrEqual(1);
    }
  });

  it('first frame renders without simulating', () => {
    let ticks = 0;
    let renders = 0;
    const loop = new FixedLoop({
      step: STEP,
      maxFrameDelta: 0.25,
      update: () => ticks++,
      render: () => renders++,
    });
    loop.frame(1000);
    expect(ticks).toBe(0);
    expect(renders).toBe(1);
  });

  it('clamps a long stall to maxFrameDelta', () => {
    let ticks = 0;
    const loop = new FixedLoop({
      step: STEP,
      maxFrameDelta: 0.25,
      update: () => ticks++,
      render: () => {},
    });
    loop.frame(0);
    loop.frame(10); // 10 s freeze, e.g. a breakpoint
    expect(ticks).toBe(15); // 0.25 s worth
  });

  it('ignores time going backwards', () => {
    let ticks = 0;
    const loop = new FixedLoop({
      step: STEP,
      maxFrameDelta: 0.25,
      update: () => ticks++,
      render: () => {},
    });
    loop.frame(5);
    loop.frame(4);
    expect(ticks).toBe(0);
  });

  it('reset() forgets the last frame so no time jump is simulated', () => {
    let ticks = 0;
    const loop = new FixedLoop({
      step: STEP,
      maxFrameDelta: 0.25,
      update: () => ticks++,
      render: () => {},
    });
    loop.frame(0);
    loop.reset();
    loop.frame(0.2);
    expect(ticks).toBe(0);
    expect(loop.ticks).toBe(0);
  });
});
