interface Sample {
  t: number;
  x: number;
  y: number;
}

/** How many samples to keep; plenty for ~1 s of 15 Hz updates. */
const KEEP = 24;

/**
 * Smooths positions that arrive in bursts from the network: sample(t) gives
 * the position at time t, gliding between the two updates around it (the
 * caller asks for a moment slightly in the past, so both are usually known).
 * Past the newest update it holds still rather than guessing.
 */
export class Interpolator {
  private readonly samples: Sample[] = [];

  push(t: number, x: number, y: number): void {
    this.samples.push({ t, x, y });
    if (this.samples.length > KEEP) this.samples.shift();
  }

  sample(t: number): { x: number; y: number } | null {
    const s = this.samples;
    if (s.length === 0) return null;
    if (t <= s[0].t) return { x: s[0].x, y: s[0].y };
    for (let i = s.length - 1; i > 0; i--) {
      const a = s[i - 1];
      const b = s[i];
      if (t >= a.t && t <= b.t) {
        const k = b.t > a.t ? (t - a.t) / (b.t - a.t) : 1;
        return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
      }
    }
    const last = s[s.length - 1];
    return { x: last.x, y: last.y };
  }
}
