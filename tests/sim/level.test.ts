import { describe, expect, it } from 'vitest';
import { GAME } from '@/config/game';
import { ENDLESS, LEVELS } from '@/config/levels';
import { firstLevelWith, levelDef, levelMapScale, newHunterTypes } from '@/sim/level';
import { IDLE_INPUT } from '@/sim/playerInput';
import { createSimulation } from '@/sim/simulation';

describe('level progression (GDD §7)', () => {
  it('levels 1–4 follow the table', () => {
    expect(levelDef(1).hunters).toEqual(['stalker']);
    expect(levelDef(1).tutorial).toBe('basics');
    expect(levelDef(2).tutorial).toBe('beam');
    expect(levelDef(2).hunters).toEqual(['stalker', 'stalker']);
    expect(levelDef(3).hunters).toEqual(['stalker', 'listener']);
    expect(levelDef(4).hunters).toEqual(['stalker', 'listener', 'sprinter']);
    expect(levelDef(4).overrides?.pingCooldown).toBe(3);
  });

  it('level 5+ adds one hunter per level, up to the cap, keeping the overrides', () => {
    const base = LEVELS[LEVELS.length - 1].hunters.length;
    for (let level = 5; level <= 12; level++) {
      const def = levelDef(level);
      expect(def.hunters).toHaveLength(Math.min(ENDLESS.maxHunters, base + (level - 4)));
      expect(def.overrides?.pingCooldown).toBe(3);
      expect(def.tutorial).toBeFalsy();
    }
  });

  it('maps grow 10% per level from level 5, capped', () => {
    for (let level = 1; level <= 4; level++) expect(levelMapScale(level)).toBe(1);
    expect(levelMapScale(5)).toBeCloseTo(1.1);
    expect(levelMapScale(8)).toBeCloseTo(1.4);
    expect(levelMapScale(50)).toBe(ENDLESS.maxMapScale);
  });

  it('levels 1–8 all build and run, getting bigger and busier', () => {
    let lastArea = 0;
    let lastHunters = 0;
    for (let level = 1; level <= 8; level++) {
      const sim = createSimulation({ seed: 3, level });
      const { tiles } = sim.state.layout;
      const area = tiles.width * tiles.height;
      expect(area).toBeGreaterThanOrEqual(lastArea);
      expect(sim.state.hunters.length).toBeGreaterThanOrEqual(lastHunters);
      expect(sim.state.hunters.map((h) => h.type)).toEqual(levelDef(level).hunters);
      lastArea = area;
      lastHunters = sim.state.hunters.length;
      for (let i = 0; i < 60 * 10; i++) sim.step({ ...IDLE_INPUT, ping: i % 200 === 0 }, 1 / 60);
    }
    expect(lastHunters).toBe(7);
  });

  it('level 4 pings are slower (3 s), earlier levels use the default', () => {
    for (const [level, cooldown] of [
      [1, GAME.abilities.ping.cooldown],
      [4, 3],
    ] as const) {
      const sim = createSimulation({ seed: 1, level, hunters: [] });
      expect(sim.state.rules.pingCooldown).toBe(cooldown);
      sim.step({ ...IDLE_INPUT, ping: true }, 1 / 60);
      expect(sim.state.player.pingCooldown).toBeCloseTo(cooldown, 5);
    }
  });
});

describe('meeting the hunters (Phase 19)', () => {
  it('one new kind per level from 3 to 7, then more of the same', () => {
    expect([2, 3, 4, 5, 6, 7, 8, 9].map(newHunterTypes)).toEqual([
      [],
      ['listener'],
      ['sprinter'],
      ['tracker'],
      ['echo'],
      ['mimic'],
      [],
      [],
    ]);
    expect(newHunterTypes(1)).toEqual([]);
    expect(firstLevelWith('stalker')).toBe(1);
    expect(firstLevelWith('mimic')).toBe(7);
  });

  it('every hunter type is met in the endless levels', () => {
    const types = new Set(levelDef(12).hunters);
    for (const t of ENDLESS.hunterPool)
      expect(types.has(t) || firstLevelWith(t) !== null).toBe(true);
    expect(levelDef(12).hunters).toHaveLength(ENDLESS.maxHunters);
  });
});
