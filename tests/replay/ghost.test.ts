import { afterEach, describe, expect, it, vi } from 'vitest';
import { Bot } from '@/bot/bot';
import { GAME } from '@/config/game';
import { GHOST } from '@/config/ghost';
import { ghostKey, loadGhost, submitGhost } from '@/platform/ghostStore';
import { decodePath, encodePath, GhostTrack, pathFromReplay } from '@/replay/ghostPath';
import { ReplayRecorder } from '@/replay/recorder';
import { samplePointAt, trackPosition } from '@/replay/replay';
import { versusBest } from '@/scenes/levelEndScene';
import { createSimulation } from '@/sim/simulation';

const DT = 1 / GAME.loop.tickRate;

function fakeStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    data,
  };
}

afterEach(() => vi.unstubAllGlobals());

/** A real level 1 played to extraction by the bot, recorded. */
function botRun(seed = 4) {
  const sim = createSimulation({ seed, level: 1 });
  const bot = new Bot(sim, 'careful');
  const recorder = new ReplayRecorder(sim, seed);
  for (let i = 0; i < 300 * GAME.loop.tickRate && sim.state.status === 'playing'; i++) {
    sim.step(bot.input(), DT);
    recorder.afterStep();
  }
  expect(sim.state.status).toBe('extracted');
  return { sim, replay: recorder.finish() };
}

/** A walk: 10 Hz samples at walking speed, with a jump (a debug warp) in the middle. */
function walk(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    x: 100 + i * 14.3 + (i > n / 2 ? 900 : 0),
    y: 200 + Math.sin(i / 5) * 40,
  }));
}

describe('ghost paths (Phase 23)', () => {
  it('round trip to within half a unit, warps included', () => {
    const points = walk(200);
    const back = decodePath(encodePath(points))!;
    expect(back).toHaveLength(points.length);
    back.forEach((p, i) => {
      expect(Math.abs(p.x - points[i].x)).toBeLessThanOrEqual(GHOST.unit / 2 + 1e-9);
      expect(Math.abs(p.y - points[i].y)).toBeLessThanOrEqual(GHOST.unit / 2 + 1e-9);
    });
  });

  it('are small: about 2 characters per sample (≈1.2 KB a minute)', () => {
    expect(encodePath(walk(600)).length).toBeLessThan(1300);
  });

  it('refuse anything malformed', () => {
    const good = encodePath(walk(10));
    for (const bad of ['', 'x', '2:1,2', '0:1,2:', '2:1,2:A', '2:1,2:!5', '2:1,2:A*', good + 'A']) {
      expect(decodePath(bad), bad).toBeNull();
    }
    expect(decodePath(good)).not.toBeNull();
  });

  it('come from a recorded round, sampled at 10 Hz', () => {
    const { replay } = botRun();
    const path = pathFromReplay(replay);
    expect(path.length).toBeGreaterThan(10);
    for (const k of [0, 5, Math.floor(path.length / 2), path.length - 1]) {
      expect(path[k]).toEqual(
        trackPosition(replay.player, samplePointAt(replay, k / GHOST.sampleHz)),
      );
    }
  });

  it('play back over time, and are gone once the run is over', () => {
    const track = new GhostTrack([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 20 },
    ]);
    expect(track.duration).toBeCloseTo(0.2);
    expect(track.positionAt(0.05)).toEqual({ x: 5, y: 0 });
    expect(track.positionAt(0.15)!.y).toBeCloseTo(10);
    expect(track.positionAt(0.3)).toBeNull();
    expect(new GhostTrack([]).positionAt(0)).toBeNull();
  });
});

describe('ghost storage', () => {
  const points = walk(30);

  it('keeps the first run and every faster one, never a slower one', () => {
    vi.stubGlobal('localStorage', fakeStorage());
    const key = ghostKey(77);
    expect(loadGhost(key)).toBeNull();
    expect(submitGhost(key, 40, points)).toEqual({ previous: null, isNew: true });
    expect(submitGhost(key, 45, walk(5))).toEqual({ previous: 40, isNew: false });
    expect(loadGhost(key)!.points).toHaveLength(points.length);
    expect(submitGhost(key, 31.5, walk(5))).toEqual({ previous: 40, isNew: true });
    expect(loadGhost(key)).toMatchObject({ seconds: 31.5 });
    expect(loadGhost(key)!.points).toHaveLength(5);
  });

  it('keeps at most maxEntries maps: the one improved longest ago goes', () => {
    vi.stubGlobal('localStorage', fakeStorage());
    for (let i = 0; i <= GHOST.maxEntries; i++) submitGhost(ghostKey(i), 50, points);
    expect(loadGhost(ghostKey(0))).toBeNull();
    expect(loadGhost(ghostKey(1))).not.toBeNull();
    // Improving map 1 makes it the newest, so map 2 is next to go.
    submitGhost(ghostKey(1), 20, points);
    submitGhost(ghostKey(999), 50, points);
    expect(loadGhost(ghostKey(1))).not.toBeNull();
    expect(loadGhost(ghostKey(2))).toBeNull();
  });

  it('does not keep a path past the size cap', () => {
    vi.stubGlobal('localStorage', fakeStorage());
    const long = walk(GHOST.maxPathChars); // 2 characters a sample: twice the cap
    expect(submitGhost(ghostKey(5), 30, long)).toEqual({ previous: null, isNew: false });
    expect(loadGhost(ghostKey(5))).toBeNull();
  });

  it('ignores corrupt data, and survives storage that throws', () => {
    vi.stubGlobal('localStorage', fakeStorage({ [GHOST.storageKey]: '{not json' }));
    expect(loadGhost(ghostKey(1))).toBeNull();
    expect(submitGhost(ghostKey(1), 30, points).isNew).toBe(true);
    expect(loadGhost(ghostKey(1))).not.toBeNull();

    const mixed = {
      version: 1,
      entries: [
        { key: 'map-1', seconds: 'fast', path: encodePath(points) },
        { key: 'map-2', seconds: 20, path: '2:broken' },
        { key: 'map-3', seconds: 20, path: encodePath(points) },
        null,
      ],
    };
    vi.stubGlobal('localStorage', fakeStorage({ [GHOST.storageKey]: JSON.stringify(mixed) }));
    expect(loadGhost('map-1')).toBeNull();
    expect(loadGhost('map-2')).toBeNull();
    expect(loadGhost('map-3')).not.toBeNull();
    vi.stubGlobal('localStorage', fakeStorage({ [GHOST.storageKey]: '{"version":9}' }));
    expect(loadGhost('map-3')).toBeNull();

    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    });
    expect(loadGhost('map-3')).toBeNull();
    expect(() => submitGhost('map-3', 10, points)).not.toThrow();
  });
});

describe('Level End against the best', () => {
  it('says how this run compares', () => {
    expect(versusBest(30, { previous: 42, isNew: true })).toBe('NEW BEST · −12 s · GHOST SAVED');
    expect(versusBest(46, { previous: 42, isNew: false })).toBe('vs best: +4 s');
    expect(versusBest(30, { previous: null, isNew: true })).toBe(
      'FIRST RUN ON THIS MAP: GHOST SAVED',
    );
    expect(versusBest(30, undefined)).toBe('');
  });
});
