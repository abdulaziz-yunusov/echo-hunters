/**
 * Seeded pseudo-random numbers (mulberry32). The same seed always gives the
 * same sequence, which multiplayer map sync, daily seeds and replays rely on.
 */
export class Rng {
  private s: number;

  constructor(seed: number) {
    this.s = seed >>> 0;
  }

  /** Float in [0, 1). */
  next(): number {
    this.s = (this.s + 0x6d2b79f5) >>> 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Float in [min, max). */
  range(min: number, max: number): number {
    return min + (max - min) * this.next();
  }

  /** Integer in [min, max], both inclusive. */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  chance(probability: number): boolean {
    return this.next() < probability;
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new Error('Rng.pick: empty array');
    return items[Math.floor(this.next() * items.length)];
  }

  /** Fisher–Yates shuffle, in place. */
  shuffle<T>(items: T[]): T[] {
    for (let i = items.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [items[i], items[j]] = [items[j], items[i]];
    }
    return items;
  }

  /** Internal state, to save and restore a stream exactly (replays). */
  get state(): number {
    return this.s;
  }

  set state(value: number) {
    this.s = value >>> 0;
  }
}

/** 32-bit FNV-1a hash. Turns names and dates into seeds. */
export function hashString(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** murmur3 finalizer: spreads every input bit across the whole output. */
function mix32(value: number): number {
  let h = value >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

/** Seed for a named stream, so streams like 'map' and 'ai' never share numbers. */
export function deriveSeed(seed: number, name: string): number {
  return mix32(mix32(seed) ^ hashString(name));
}

/**
 * Independent generators from one seed. Keep generation and gameplay on
 * separate streams: extra AI rolls on the host must never change the map.
 */
export function createStreams<const N extends string>(
  seed: number,
  names: readonly N[],
): Record<N, Rng> {
  const streams = {} as Record<N, Rng>;
  for (const name of names) streams[name] = new Rng(deriveSeed(seed, name));
  return streams;
}
