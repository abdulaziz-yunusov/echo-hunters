import { describe, expect, it } from 'vitest';
import { EMITTER_PLACEMENT, EMITTER_TYPES } from '@/config/emitters';
import { ReplayRecorder } from '@/replay/recorder';
import { emitterActiveAt } from '@/replay/replay';
import { setHunterState } from '@/sim/ai/hunterBrain';
import type { Emitter } from '@/sim/entities/emitter';
import type { SoundEmitted } from '@/sim/events';
import { levelDef } from '@/sim/level';
import { IDLE_INPUT } from '@/sim/playerInput';
import { createSimulation } from '@/sim/simulation';
import { isMasked, playerMasked } from '@/sim/systems/emitters';
import { distanceField } from '@/sim/world/pathfinding';
import { DIRS4 } from '@/sim/world/tileMap';
import { simFromAscii } from '../../helpers/maps';

const DT = 1 / 60;
const VENT = EMITTER_TYPES.vent;

function vent(x: number, y: number, over: Partial<Emitter> = {}): Emitter {
  return { id: 1, type: 'vent', x, y, timer: 99, activeLeft: 0, ...over };
}

describe('emitter placement', () => {
  it('follows the level table: none on the tutorial level, some later', () => {
    expect(createSimulation({ seed: 3, level: 1 }).state.emitters).toHaveLength(0);
    const counts = levelDef(4).emitters ?? {};
    const expected = Object.values(counts).reduce((a, b) => a + (b ?? 0), 0);
    expect(createSimulation({ seed: 3, level: 4 }).state.emitters).toHaveLength(expected);
    expect(levelDef(9).emitters).toBeDefined();
  });

  it('is deterministic, on corridors, away from spawns, spaced apart, off objectives', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const a = createSimulation({ seed, level: 5 }).state;
      const b = createSimulation({ seed, level: 5 }).state;
      expect(b.emitters).toEqual(a.emitters);

      const { tiles } = a.layout;
      const fromSpawn = distanceField(tiles, a.layout.spawns);
      const busy = new Set(
        [...a.cores, a.beacon, ...a.pickups].map((o) =>
          tiles.index(tiles.toTile(o.x), tiles.toTile(o.y)),
        ),
      );
      for (const e of a.emitters) {
        const tx = tiles.toTile(e.x);
        const ty = tiles.toTile(e.y);
        const i = tiles.index(tx, ty);
        expect(DIRS4.filter(([dx, dy]) => tiles.isFloor(tx + dx, ty + dy))).toHaveLength(2);
        expect(fromSpawn[i]).toBeGreaterThanOrEqual(EMITTER_PLACEMENT.minFromSpawn);
        expect(busy.has(i)).toBe(false);
        const others = a.emitters.filter((o) => o !== e);
        if (others.length === 0) continue;
        const spacing = distanceField(
          tiles,
          others.map((o) => ({ tx: tiles.toTile(o.x), ty: tiles.toTile(o.y) })),
        );
        expect(spacing[i]).toBeGreaterThanOrEqual(EMITTER_PLACEMENT.minSpacing);
      }
    }
  });
});

describe('emitter cycle', () => {
  it('makes its noise at the start of each spell and covers for activeTime', () => {
    const sim = simFromAscii(['#########', '#P......#', '#########'], { hunters: [] });
    sim.state.emitters = [vent(6 * 32 + 16, 48, { timer: 0.5 })];
    const sounds: SoundEmitted[] = [];
    sim.events.on('soundEmitted', (s) => {
      if (s.kind === 'ventHum') sounds.push(s);
    });
    const run = (seconds: number) => {
      for (let i = 0; i < Math.round(seconds / DT); i++) sim.step(IDLE_INPUT, DT);
    };
    run(0.45);
    expect(sounds).toHaveLength(0);
    run(0.1);
    expect(sounds).toHaveLength(1);
    expect(sim.state.emitters[0].activeLeft).toBeGreaterThan(0);
    run(VENT.activeTime);
    expect(sim.state.emitters[0].activeLeft).toBe(0);
    run(VENT.period - VENT.activeTime);
    expect(sounds).toHaveLength(2);
    expect(sounds[1].time - sounds[0].time).toBeCloseTo(VENT.period, 1);
    expect(sounds[0].owner).toBeNull();
  });
});

describe('sound cover', () => {
  /**
   * A frozen Stalker 128 px from the player: in range of a metal footstep
   * (180 px) and of a ping. A vent sits on the player, or `ventOffset` px away.
   */
  function setup(active: boolean, ventOffset = 0) {
    const sim = simFromAscii(['###########', '#P...H....#', '###########'], {
      hunters: ['stalker'],
    });
    const hunter = sim.state.hunters[0];
    setHunterState(sim, hunter, 'stunned');
    const { player } = sim.state;
    sim.state.emitters = [vent(player.x + ventOffset, player.y, { activeLeft: active ? 1 : 0 })];
    let heard = 0;
    sim.events.on('hunterHeard', () => heard++);
    const make = (kind: 'stepMetal' | 'ping' | 'wallBump') => {
      sim.emitSound(kind, player.x, player.y, player.id);
      for (let i = 0; i < 60; i++) sim.step(IDLE_INPUT, DT); // long enough to arrive
      return heard;
    };
    return { sim, make };
  }

  it('hides footsteps and wall bumps near a running vent', () => {
    expect(setup(true).make('stepMetal')).toBe(0);
    expect(setup(true).make('wallBump')).toBe(0);
    expect(setup(false).make('stepMetal')).toBe(1); // same step between spells: heard
  });

  it('only within its radius', () => {
    expect(setup(true, VENT.maskRadius + 10).make('stepMetal')).toBe(1);
    expect(setup(true, VENT.maskRadius - 10).make('stepMetal')).toBe(0);
  });

  it('never hides a ping', () => {
    expect(setup(true).make('ping')).toBe(1);
  });

  it('tells whether the player stands in cover', () => {
    const { sim } = setup(true);
    expect(playerMasked(sim.state)).toBe(true);
    sim.state.emitters[0].activeLeft = 0;
    expect(playerMasked(sim.state)).toBe(false);
    expect(isMasked(sim.state, 0, 0, ['ping'])).toBe(false);
  });
});

describe('emitters in replays', () => {
  it('record each spell, so the replay knows when cover was up', () => {
    const sim = createSimulation({ seed: 3, level: 4 });
    const recorder = new ReplayRecorder(sim, 3);
    for (let i = 0; i < 60 * 8; i++) {
      sim.step(IDLE_INPUT, DT);
      recorder.afterStep();
    }
    const replay = recorder.finish();
    const vents = replay.emitters.filter((e) => e.type === 'vent');
    expect(vents.length).toBeGreaterThan(0);
    const [v] = vents;
    expect(v.spells.length).toBeGreaterThanOrEqual(1);
    const start = v.spells[0];
    expect(emitterActiveAt(v, start + VENT.activeTime / 2)).toBe(true);
    expect(emitterActiveAt(v, start + VENT.activeTime + 0.1)).toBe(false);
    expect(emitterActiveAt(v, start - 0.01)).toBe(false); // before its first spell
  });
});
