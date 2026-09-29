import { describe, expect, it } from 'vitest';
import { SOUND_KINDS } from '@/config/sounds';
import { setHunterState } from '@/sim/ai/hunterBrain';
import type { GameEvents } from '@/sim/events';
import { IDLE_INPUT, type PlayerInput } from '@/sim/playerInput';
import type { SimulationOptions } from '@/sim/simulation';
import { simFromAscii } from '../../helpers/maps';

const DT = 1 / 60;

// The hunter is 64 px from the player but around a corner: 6 tiles (192 px) of corridor.
const CORNER = ['#####', '#P..#', '###.#', '#H..#', '#####'];
// Open room: the hunter is in plain line of sight, 96 px away.
const OPEN = ['#########', '#.......#', '#.P..H..#', '#.......#', '#########'];

function setup(rows: string[], options: SimulationOptions = { hunters: ['stalker'] }) {
  const sim = simFromAscii(rows, options);
  // Stunned hunters stand still, so the test controls the distances. They still hear.
  for (const h of sim.state.hunters) setHunterState(sim, h, 'stunned');
  const heard: (GameEvents['hunterHeard'] & { time: number })[] = [];
  sim.events.on('hunterHeard', (e) => heard.push({ ...e, time: sim.state.time }));
  const run = (input: Partial<PlayerInput>, seconds: number) => {
    for (let i = 0; i < Math.round(seconds / DT); i++) {
      // Keep them frozen (stun wears off after 3 s).
      for (const h of sim.state.hunters) if (h.stateTime > 2) setHunterState(sim, h, 'stunned');
      sim.step({ ...IDLE_INPUT, ...input }, DT);
    }
  };
  const ping = () => run({ ping: true }, DT);
  return { sim, heard, run, ping };
}

describe('hearing', () => {
  it("'path': a ping is heard around a corner, muffled", () => {
    const { sim, heard, ping, run } = setup(CORNER);
    sim.state.hearingModel = 'path';
    ping();
    run({}, 1.5);
    expect(heard).toHaveLength(1);
    // 192 px of corridor / 0.75 = 256 px effective, at 350 px/s.
    expect(heard[0].time).toBeCloseTo(256 / SOUND_KINDS.ping.speed, 1);
  });

  it('a ping carries further than its visible ring (hearRadius), still muffled by corners', () => {
    // 14 tiles of corridor = 448 px, / 0.75 = 597 px: beyond the 400 px ring, within the 800 px hearing.
    const LONG = ['#########', '#P......#', '#######.#', '#H......#', '#########'];
    for (const model of ['path', 'los'] as const) {
      const { sim, heard, ping, run } = setup(LONG);
      sim.state.hearingModel = model;
      ping();
      run({}, 2.5);
      if (model === 'path') {
        expect(heard).toHaveLength(1);
        expect(heard[0].time).toBeCloseTo(448 / 0.75 / SOUND_KINDS.ping.speed, 1);
      } else {
        expect(heard).toHaveLength(0);
      }
    }
  });

  it("'los': the same ping is blocked by the wall", () => {
    const { sim, heard, ping, run } = setup(CORNER);
    sim.state.hearingModel = 'los';
    ping();
    run({}, 1.5);
    expect(heard).toHaveLength(0);
  });

  it('quiet sounds do not carry around corners', () => {
    const { sim, heard, run } = setup(CORNER);
    sim.state.hearingModel = 'path';
    run({ moveX: 1 }, 1); // footsteps in the top corridor
    expect(heard).toHaveLength(0);
  });

  it('in line of sight both models hear, when the ring arrives', () => {
    for (const model of ['los', 'path'] as const) {
      const { sim, heard, ping, run } = setup(OPEN);
      sim.state.hearingModel = model;
      ping();
      run({}, 1);
      expect(heard, model).toHaveLength(1);
      expect(heard[0].time).toBeCloseTo(96 / SOUND_KINDS.ping.speed, 1);
      expect(heard[0]).toMatchObject({ x: sim.state.player.x, y: sim.state.player.y });
    }
  });

  it('each sound is heard once, not every tick while inside the ring', () => {
    const { heard, ping, run } = setup(OPEN);
    ping();
    run({}, 2);
    expect(heard).toHaveLength(1);
  });

  it('sneaking makes no sound to hear', () => {
    const { heard, run } = setup(OPEN);
    run({ moveX: 1, sneak: true }, 1);
    expect(heard).toHaveLength(0);
  });

  it('walking close by is heard', () => {
    const { heard, run } = setup(OPEN);
    run({ moveX: 1 }, 1); // steps within 60 px of the hunter
    expect(heard.length).toBeGreaterThan(0);
  });

  it('the Sprinter ignores footsteps but hears pings', () => {
    const { heard, run, ping } = setup(OPEN, { hunters: ['sprinter'] });
    run({ moveX: 1 }, 1);
    expect(heard).toHaveLength(0);
    ping();
    run({}, 1);
    expect(heard).toHaveLength(1);
  });

  it("hunters never react to other hunters' footsteps or their own", () => {
    const rows = ['###########', '#P........#', '#..H...H..#', '#.........#', '###########'];
    const { sim, heard } = setup(rows);
    for (const h of sim.state.hunters) sim.emitSound('hunterStep', h.x, h.y, h.id);
    for (let i = 0; i < 60; i++) sim.step(IDLE_INPUT, DT);
    expect(heard).toHaveLength(0);
  });
});
