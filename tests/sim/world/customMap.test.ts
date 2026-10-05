import { describe, expect, it, vi } from 'vitest';
import { Bot } from '@/bot/bot';
import { CELLS, EDITOR } from '@/config/editor';
import { GAME } from '@/config/game';
import { dailyDate, dailyResult, dailySeed } from '@/platform/daily';
import { mapLink, sharedMapFromHash } from '@/platform/shareLink';
import { loadSave, submitDaily } from '@/platform/storage';
import { createCustomSimulation } from '@/sim/simulation';
import {
  customRound,
  decodeMap,
  emptyMap,
  encodeMap,
  mapFromLayout,
  mapProblems,
  type CustomMap,
} from '@/sim/world/customMap';
import { MapEditing } from '@/sim/world/mapEditing';
import { generateMap, mapOptionsFromConfig } from '@/sim/world/mapGen';

/** Rows of cell letters → a map. */
function fromRows(rows: string[]): CustomMap {
  return {
    width: rows[0].length,
    height: rows.length,
    cells: rows.join('').split('') as CustomMap['cells'],
  };
}

const PLAYABLE = ['wwwwwwwwwww', 'wPffffSfffw', 'wfwwwwwwwfw', 'wCfTffVfDBw', 'wwwwwwwwwww'];

describe('hand-made maps (Phase 13)', () => {
  it('travel as short URL-safe text, and come back the same', () => {
    const generated = mapFromLayout(generateMap(mapOptionsFromConfig(42)));
    const text = encodeMap(generated);
    expect(text).toMatch(/^v1\.41x25\.[0-9A-Za-z]+$/);
    expect(text.length).toBeLessThan(generated.cells.length); // runs pack it
    expect(decodeMap(text)).toEqual(generated);
    expect(decodeMap(encodeMap(fromRows(PLAYABLE)))).toEqual(fromRows(PLAYABLE));
  });

  it('refuse anything malformed, unknown or too big', () => {
    for (const bad of [
      '',
      'v2.3x3.9w',
      'v1.3x3.8w', // too few cells
      'v1.3x3.10w', // too many
      'v1.3x3.9z', // unknown cell
      'v1.3x3.9w!',
      `v1.${EDITOR.maxSide + 1}x3.${(EDITOR.maxSide + 1) * 3}w`,
      'v1.2x2.4w',
    ]) {
      expect(decodeMap(bad), bad).toBeNull();
    }
  });

  it('say what stops them from being played', () => {
    expect(mapProblems(emptyMap(9, 7))).toEqual([
      'Place a START.',
      'Place at least one CORE.',
      'Place a BEACON.',
    ]);
    expect(mapProblems(fromRows(PLAYABLE))).toEqual([]);

    // Wall off the right-hand corridor from both ends: the beacon side can't be reached.
    const cut = fromRows(
      PLAYABLE.map((r, y) => (y === 3 ? r.replace('fT', 'wT') : y === 2 ? 'wfwwwwwwwww' : r)),
    );
    expect(mapProblems(cut)).toEqual(['Something can’t be reached from the START.']);
    const open = fromRows(PLAYABLE.map((r, y) => (y === 0 ? 'wwwfwwwwwww' : r)));
    expect(mapProblems(open)).toContain('The outer edge must be wall.');
    const twoStarts = fromRows(PLAYABLE.map((r, y) => (y === 3 ? r.replace('C', 'P') : r)));
    expect(mapProblems(twoStarts)).toContain('Only one START.');
  });

  it('play with their own hunters, pickups and emitters exactly where they were put', () => {
    const map = fromRows(PLAYABLE);
    const { state } = createCustomSimulation(map);
    const tile = (x: number, y: number) => ({
      x: x * GAME.map.tileSize + GAME.map.tileSize / 2,
      y: y * GAME.map.tileSize + GAME.map.tileSize / 2,
    });
    expect({ x: state.player.x, y: state.player.y }).toEqual(tile(1, 1));
    expect(state.hunters.map((h) => [h.type, h.x, h.y])).toEqual([
      ['stalker', tile(6, 1).x, tile(6, 1).y],
    ]);
    expect(state.cores.map((c) => [c.x, c.y])).toEqual([[tile(1, 3).x, tile(1, 3).y]]);
    expect({ x: state.beacon.x, y: state.beacon.y }).toEqual(tile(9, 3));
    expect(state.pickups.map((p) => [p.type, p.x])).toEqual([['stoneBag', tile(3, 3).x]]);
    expect(state.emitters.map((e) => [e.type, e.x])).toEqual([
      ['vent', tile(6, 3).x],
      ['drip', tile(8, 3).x],
    ]);
    // The Phase 19 hunters have cells too; a Mimic stays where it was put (no rooms).
    const all = { ...map, cells: [...map.cells] };
    all.cells[map.width * 1 + 7] = CELLS.tracker;
    all.cells[map.width * 1 + 8] = CELLS.echo;
    all.cells[map.width * 1 + 9] = CELLS.mimic;
    expect(createCustomSimulation(all).state.hunters.map((h) => [h.type, h.x])).toEqual([
      ['stalker', tile(6, 1).x],
      ['tracker', tile(7, 1).x],
      ['echo', tile(8, 1).x],
      ['mimic', tile(9, 1).x],
    ]);
    // The map's text is its seed: the same map always plays the same.
    expect(customRound(map).layout.seed).toBe(customRound(fromRows(PLAYABLE)).layout.seed);
  });

  it('a generated level, turned into a hand-made map, can be played to the end', () => {
    const map = mapFromLayout(generateMap(mapOptionsFromConfig(7)));
    expect(mapProblems(map)).toEqual([]);
    const sim = createCustomSimulation(map);
    const bot = new Bot(sim, 'careful');
    for (let i = 0; i < 300 * 60 && sim.state.status === 'playing'; i++) {
      sim.step(bot.input(), 1 / 60);
    }
    expect(sim.state.status).toBe('extracted');
  });
});

describe('editing a map', () => {
  it('paints cells, keeps the outer wall, and moves the start rather than adding one', () => {
    const e = new MapEditing(emptyMap(9, 7));
    expect(e.paint(0, 3, CELLS.floor)).toBe(false); // the edge stays wall
    expect(e.paint(2, 2, CELLS.start)).toBe(true);
    e.paint(5, 4, CELLS.start);
    expect(e.map.cells.filter((c) => c === CELLS.start)).toHaveLength(1);
    expect(e.map.cells[4 * 9 + 5]).toBe(CELLS.start);
    expect(e.paint(5, 4, CELLS.start)).toBe(false); // nothing changed
  });

  it('undoes a whole stroke at a time', () => {
    const e = new MapEditing(emptyMap(9, 7));
    expect(e.canUndo).toBe(false);
    e.beginStroke();
    for (let x = 1; x < 8; x++) e.paint(x, 3, CELLS.wall);
    e.beginStroke();
    e.paint(4, 4, CELLS.core);
    e.undo();
    expect(e.map.cells[4 * 9 + 4]).toBe(CELLS.floor);
    expect(e.map.cells[3 * 9 + 4]).toBe(CELLS.wall);
    e.undo();
    expect(e.map).toEqual(emptyMap(9, 7));
  });
});

describe('sharing', () => {
  it('a #map= link opens only a valid map', () => {
    const text = encodeMap(fromRows(PLAYABLE));
    expect(sharedMapFromHash(`#map=${text}`)).toBe(text);
    expect(sharedMapFromHash('#map=v1.3x3.junk')).toBeNull();
    expect(sharedMapFromHash('#other')).toBeNull();
    expect(mapLink(text)).toMatch(new RegExp(`#map=${text.replace(/\./g, '\\.')}$`));
  });
});

describe('Daily Seed (Phase 13)', () => {
  it('is the same run for everyone on the same UTC day, and a new one tomorrow', () => {
    expect(dailyDate(new Date('2026-10-05T23:30:00Z'))).toBe('2026-10-05');
    expect(dailyDate(new Date('2026-10-06T00:30:00+02:00'))).toBe('2026-10-05'); // still the 5th in UTC
    expect(dailySeed('2026-10-05')).toBe(dailySeed('2026-10-05'));
    expect(dailySeed('2026-10-06')).not.toBe(dailySeed('2026-10-05'));
  });

  it('gives a result to share', () => {
    const text = dailyResult(
      { date: '2026-10-05', level: 4, score: 2340, difficulty: 'hard' },
      'https://example.org/',
    );
    expect(text).toBe(
      'PULSE: Echo Hunters · Daily 2026-10-05 · level 4 · 2340 pts (HARD)\nhttps://example.org/',
    );
  });

  it("keeps the day's best score, and only that day's", () => {
    const data = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => void data.set(k, v),
    });
    try {
      expect(submitDaily('2026-10-05', 500)).toEqual({ best: 500, isNew: true });
      expect(submitDaily('2026-10-05', 300)).toEqual({ best: 500, isNew: false });
      expect(submitDaily('2026-10-06', 100)).toEqual({ best: 100, isNew: true }); // a new day
      expect(loadSave().dailyBest).toEqual({ date: '2026-10-06', score: 100 });
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
