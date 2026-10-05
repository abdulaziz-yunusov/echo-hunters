import { describe, expect, it } from 'vitest';
import { HUNTER_COMMON, HUNTER_TYPES } from '@/config/hunters';
import { nextTrailPoint, pruneTrail, recordTrail, type TrailPoint } from '@/sim/ai/trail';
import { PLAYER_ID } from '@/sim/entities/entity';
import { IDLE_INPUT, type PlayerInput } from '@/sim/playerInput';
import type { Simulation } from '@/sim/simulation';
import { simFromAscii } from '../../helpers/maps';

const DT = 1 / 60;

// The Tracker starts one tile right of the player, close enough to hear the first step.
const ROOM = [
  '##########################',
  '#........................#',
  '#........................#',
  '#..................PH....#',
  '#........................#',
  '##########################',
];

function setup(rows = ROOM) {
  const sim = simFromAscii(rows, { hunters: ['tracker'] });
  /** Times of the player's footsteps, in order. */
  const steps: number[] = [];
  /** Times of the trail points the Tracker reached, in order. */
  const visited: number[] = [];
  /** Its state changes. */
  const states: string[] = [];
  sim.events.on('soundEmitted', (s) => {
    if (s.owner === PLAYER_ID && s.kind === 'step') steps.push(s.time);
  });
  const run = (input: Partial<PlayerInput>, seconds: number) => {
    for (let i = 0; i < Math.round(seconds / DT); i++) {
      sim.step({ ...IDLE_INPUT, ...input }, DT);
      const h = sim.state.hunters[0];
      if (h.trailAt && visited.at(-1) !== h.trailAt.time) visited.push(h.trailAt.time);
      if (states.at(-1) !== h.state) states.push(h.state);
    }
  };
  return { sim, steps, visited, states, run, tracker: () => sim.state.hunters[0] };
}

const sound = (sim: Simulation, owner: number, at: Partial<TrailPoint> = {}) => ({
  owner,
  x: at.x ?? 100,
  y: at.y ?? 100,
  time: at.time ?? sim.state.time,
});

describe('trail', () => {
  it('records walking steps, but nothing while sneaking', () => {
    const { sim, run } = setup();
    run({ moveX: -1, sneak: true }, 1);
    expect(sim.state.trail).toHaveLength(0);
    run({ moveX: -1 }, 1);
    expect(sim.state.trail.length).toBeGreaterThan(1);
    expect(sim.state.trail.every((p) => p.owner === PLAYER_ID)).toBe(true);
  });

  it('forgets steps older than trailLife', () => {
    const { sim } = setup();
    sim.state.trail.push(sound(sim, PLAYER_ID, { time: 0 }), sound(sim, PLAYER_ID, { time: 5 }));
    sim.state.time = HUNTER_COMMON.trailLife + 1;
    pruneTrail(sim.state);
    expect(sim.state.trail.map((p) => p.time)).toEqual([5]);
  });

  it('the next step is the same player’s, and the trail breaks at a gap', () => {
    const { sim } = setup();
    const a = sound(sim, PLAYER_ID, { x: 100, time: 1 });
    sim.state.trail.push(
      a,
      sound(sim, 2, { x: 120, time: 2 }),
      sound(sim, PLAYER_ID, { x: 150, time: 3 }),
      sound(sim, PLAYER_ID, { x: 400, time: 4 }),
    );
    const gap = HUNTER_TYPES.tracker.trailGap;
    const b = nextTrailPoint(sim.state, a, gap);
    expect(b).toMatchObject({ x: 150, time: 3 });
    expect(nextTrailPoint(sim.state, b!, gap)).toBeNull(); // 250 px on: lost
  });

  it('decoy steps and steps in running sound cover leave no trail', () => {
    const { sim } = setup();
    const wave = (decoy: boolean) => {
      sim.emitSound('step', 200, 112, PLAYER_ID, { decoy });
      return sim.state.waves.at(-1)!;
    };
    wave(true);
    expect(sim.state.trail).toHaveLength(0);
    sim.state.emitters.push({ id: 1, type: 'vent', x: 200, y: 112, timer: 9, activeLeft: 2 });
    sim.state.trail.length = 0;
    recordTrail(sim.state, wave(false));
    expect(sim.state.trail).toHaveLength(0);
  });
});

describe('Tracker', () => {
  it('ignores pings', () => {
    const { sim, run } = setup();
    let heard = 0;
    sim.events.on('hunterHeard', () => heard++);
    run({ ping: true }, 0.5);
    expect(heard).toBe(0);
  });

  it('follows the trail step by step, in order, sniffing', () => {
    const { sim, run, steps, visited } = setup();
    let sniffs = 0;
    sim.events.on('soundEmitted', (s) => s.kind === 'trackerSniff' && sniffs++);
    run({ moveX: -1 }, 1.5);
    run({ moveY: -1 }, 0.5);
    run({ moveX: -1 }, 1);
    run({}, 6);
    expect(visited.length).toBeGreaterThan(4);
    // A run of the player's steps with none skipped, oldest first.
    const first = steps.indexOf(visited[0]);
    expect(first).toBeGreaterThanOrEqual(0);
    expect(visited).toEqual(steps.slice(first, first + visited.length));
    expect(sniffs).toBeGreaterThan(1);
  });

  it('loses the trail where the player sneaked', () => {
    const { run, steps, visited, states } = setup();
    run({ moveX: -1 }, 0.8);
    const lastBeforeGap = steps.at(-1)!;
    run({ moveX: -1, sneak: true }, 2.2);
    run({ moveX: -1 }, 0.8);
    run({}, 4);
    // Its first trail ends at the last step before the gap; then it searches.
    const lost = states.indexOf('search');
    expect(lost).toBeGreaterThan(states.indexOf('investigate'));
    expect(visited.filter((t) => t <= lastBeforeGap).at(-1)).toBe(lastBeforeGap);
    expect(visited.find((t) => t > lastBeforeGap)).toBeUndefined();
  });
});
