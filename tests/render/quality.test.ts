import { describe, expect, it } from 'vitest';
import { DISPLAY } from '@/config/display';
import { GlowGovernor, installGlowSwitch } from '@/render/quality';

/** Feed `seconds` of frames at `fps`. */
function frames(g: GlowGovernor, fps: number, seconds: number) {
  for (let t = 0; t < seconds; t += 1 / fps) g.frame(1 / fps);
}

describe('glow governor (Phase 12)', () => {
  it('AUTO keeps glow on a device that keeps up', () => {
    const g = new GlowGovernor('auto');
    frames(g, 60, 30);
    frames(g, 50, 30); // a bit slow, but above the line
    expect(g.enabled).toBe(true);
  });

  it(`AUTO turns glow off after ${DISPLAY.glow.judgeSeconds} s of slow frames, for good`, () => {
    const g = new GlowGovernor('auto');
    frames(g, 30, DISPLAY.glow.judgeSeconds * 0.5);
    expect(g.enabled).toBe(true); // not yet: a short dip is forgiven
    frames(g, 30, DISPLAY.glow.judgeSeconds + 0.5);
    expect(g.enabled).toBe(false);
    expect(g.autoOff).toBe(true);
    frames(g, 60, 30); // faster without glow: it stays off (no flicker)
    expect(g.enabled).toBe(false);
  });

  it('a hidden tab (one huge frame gap) is not a slow device', () => {
    const g = new GlowGovernor('auto');
    for (let i = 0; i < 10; i++) {
      g.frame(5);
      frames(g, 60, 1);
    }
    expect(g.enabled).toBe(true);
  });

  it('ON and OFF override AUTO', () => {
    const slow = new GlowGovernor('auto');
    frames(slow, 20, 10);
    slow.set('on');
    expect(slow.enabled).toBe(true);
    slow.set('off');
    expect(slow.enabled).toBe(false);
    expect(new GlowGovernor('off').enabled).toBe(false);
  });
});

describe('glow switch', () => {
  it('lets shadowBlur through only while glow is on', () => {
    class FakeContext {
      private blur = 0;
      get shadowBlur() {
        return this.blur;
      }
      set shadowBlur(v: number) {
        this.blur = v;
      }
    }
    const ctx = new FakeContext() as unknown as CanvasRenderingContext2D;
    let on = true;
    installGlowSwitch(ctx, () => on);
    ctx.shadowBlur = 12;
    expect(ctx.shadowBlur).toBe(12);
    on = false;
    ctx.shadowBlur = 12;
    expect(ctx.shadowBlur).toBe(0);
  });
});
