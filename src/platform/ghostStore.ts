import { GHOST } from '@/config/ghost';
import type { Vec2 } from '@/core/geometry';
import { decodePath, encodePath } from '@/replay/ghostPath';

/** One map's best run: how long it took (s) and its encoded path. */
interface GhostEntry {
  key: string;
  seconds: number;
  path: string;
}

/** The ghost of a map's best run, ready to play. */
export interface StoredGhost {
  seconds: number;
  points: Vec2[];
}

/** A map is known by its seed (a generated level's, or a hand-made map's text hash). */
export function ghostKey(mapSeed: number): string {
  return `map-${mapSeed}`;
}

/** Saved ghosts, least recently improved first. Anything malformed is left out; never throws. */
function loadAll(): GhostEntry[] {
  try {
    const raw = globalThis.localStorage?.getItem(GHOST.storageKey);
    if (!raw) return [];
    const data = JSON.parse(raw) as { version?: unknown; entries?: unknown };
    if (data.version !== 1 || !Array.isArray(data.entries)) return [];
    return data.entries.filter(
      (e: Partial<GhostEntry> | null): e is GhostEntry =>
        typeof e === 'object' &&
        e !== null &&
        typeof e.key === 'string' &&
        typeof e.seconds === 'number' &&
        e.seconds > 0 &&
        typeof e.path === 'string' &&
        e.path.length <= GHOST.maxPathChars,
    );
  } catch {
    return [];
  }
}

function saveAll(entries: readonly GhostEntry[]): void {
  try {
    globalThis.localStorage?.setItem(GHOST.storageKey, JSON.stringify({ version: 1, entries }));
  } catch {
    // Storage full or blocked: no ghosts, the game still works.
  }
}

/** This map's best run, if one was saved and is readable. */
export function loadGhost(key: string): StoredGhost | null {
  const entry = loadAll().find((e) => e.key === key);
  const points = entry ? decodePath(entry.path) : null;
  return entry && points && points.length > 0 ? { seconds: entry.seconds, points } : null;
}

/**
 * An extraction on this map in `seconds`, along `points`. It becomes the
 * map's ghost if it is the first or the fastest. Keeps at most
 * GHOST.maxEntries maps: the one improved longest ago goes. Returns the
 * previous best time (null if there was none) and whether this one is new.
 */
export function submitGhost(
  key: string,
  seconds: number,
  points: readonly Vec2[],
): { previous: number | null; isNew: boolean } {
  const all = loadAll();
  const old = all.find((e) => e.key === key);
  const previous = old ? old.seconds : null;
  if (previous !== null && seconds >= previous) return { previous, isNew: false };
  const path = encodePath(points);
  if (path.length > GHOST.maxPathChars) return { previous, isNew: false };
  const kept = all.filter((e) => e.key !== key);
  kept.push({ key, seconds, path });
  saveAll(kept.slice(-GHOST.maxEntries));
  return { previous, isNew: true };
}
