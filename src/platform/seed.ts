import { hashString } from '@/core/rng';

/** A fresh random seed. Lives outside the simulation, which may only use seeded streams. */
export function randomSeed(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0];
}

/**
 * Seed from the page URL, to reproduce a map: `?seed=12345`, or any text
 * such as `?seed=hello` (hashed). Returns null when absent.
 */
export function seedFromUrl(): number | null {
  const value = new URLSearchParams(window.location.search).get('seed');
  if (value === null || value === '') return null;
  const n = Number(value);
  return Number.isInteger(n) ? n >>> 0 : hashString(value);
}
