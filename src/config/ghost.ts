/**
 * The echo of your best run (Phase 23): the path of your fastest
 * extraction on each map, shown as a pale silhouette where your rings pass
 * over it the next time you play that map.
 */
export const GHOST = {
  /** Path samples per second. */
  sampleHz: 10,
  /** Positions are stored in steps of this many px. */
  unit: 2,
  /** Maps remembered; the least recently improved goes first. */
  maxEntries: 40,
  /** A longer path (a very slow round) isn't kept: about 10 minutes at 10 Hz. */
  maxPathChars: 12_000,
  /** Own localStorage key, apart from the save (it is much bigger and can be lost alone). */
  storageKey: 'pulse-echo-hunters-ghosts',
} as const;
