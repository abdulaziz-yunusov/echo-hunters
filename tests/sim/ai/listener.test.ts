import { describe, expect, it } from 'vitest';
import { HUNTER_TYPES } from '@/config/hunters';
import { setHunterState } from '@/sim/ai/hunterBrain';
import type { SoundEmitted } from '@/sim/events';
import { IDLE_INPUT, type PlayerInput } from '@/sim/playerInput';
import type { SimulationOptions } from '@/sim/simulation';
import { simFromAscii } from '../../helpers/maps';

const DT = 1 / 60;

// Listener (first H) 128 px from the player; a Stalker (second H) far to the right.
const ROOM = [
  '#########################',
  '#.......................#',
  '#.P...H...............H.#',
  '#.......................#',
  '#########################',
];

function setup(options: SimulationOptions = { hunters: ['listener', 'stalker'] }, rows = ROOM) {
  const sim = simFromAscii(rows, options);
  const screams: SoundEmitted[] = [];
  sim.events.on('soundEmitted', (s) => s.kind === 'listenerScream' && screams.push(s));
  const run = (input: Partial<PlayerInput>, seconds: number) => {
    for (let i = 0; i < Math.max(1, Math.round(seconds / DT)); i++) {
      sim.step({ ...IDLE_INPUT, ...input }, DT);
    }
  };
  return {
    sim,
    screams,
    run,
    listener: () => sim.state.hunters[0],
    stalker: () => sim.state.hunters[1],
  };
}

describe('Listener', () => {
  it('never moves', () => {
    const { run, listener } = setup();
    const { x, y } = listener();
    run({ ping: true }, 3);
    expect(listener()).toMatchObject({ x, y });
  });

  it('screams when it hears the player, from its own position', () => {
    const { run, screams, listener } = setup();
    run({ ping: true }, 1);
    expect(screams).toHaveLength(1);
    expect(screams[0]).toMatchObject({ x: listener().x, y: listener().y, owner: listener().id });
  });

  it('the scream sends other hunters to the noise, not to the Listener', () => {
    // The Stalker is 864 px from the player: out of the ping's 800 px hearing,
    // but in range of the Listener's scream.
    const WIDE = [
      '###############################',
      '#.............................#',
      '#.P...H.....................H.#',
      '#.............................#',
      '###############################',
    ];
    const { sim, run, stalker } = setup({ hunters: ['listener', 'stalker'] }, WIDE);
    const heardByStalker: { x: number; y: number }[] = [];
    sim.events.on('hunterHeard', (e) => e.hunterId === stalker().id && heardByStalker.push(e));
    const origin = { x: sim.state.player.x, y: sim.state.player.y };
    run({ ping: true }, DT);
    run({}, 3);
    expect(heardByStalker).toHaveLength(1); // only the scream reached it
    expect(heardByStalker[0]).toMatchObject(origin);
    expect(stalker().lastHeard).toEqual(origin);
  });

  it('only hears within 300 px', () => {
    const rows = [
      '###########################',
      '#P......................H#',
      '###########################',
    ];
    const { run, screams } = setup({ hunters: ['listener'] }, rows);
    run({ moveX: 1 }, 0.6); // footsteps ~700 px away
    expect(screams).toHaveLength(0);
    expect(HUNTER_TYPES.listener.hearRange).toBe(300);
  });

  it('screams at most once per cooldown', () => {
    const { run, screams } = setup({ hunters: ['listener'] });
    run({ moveX: 0.01 }, DT);
    for (let i = 0; i < 20; i++) run({ ping: i % 3 === 0, moveY: i % 2 ? 1 : -1 }, 0.25);
    const times = screams.map((s) => s.time);
    for (let i = 1; i < times.length; i++) {
      expect(times[i] - times[i - 1]).toBeGreaterThanOrEqual(HUNTER_TYPES.listener.screamCooldown);
    }
    expect(times.length).toBeGreaterThan(0);
  });

  it('a stunned Listener stays quiet', () => {
    const { sim, run, screams, listener } = setup({ hunters: ['listener'] });
    setHunterState(sim, listener(), 'stunned');
    run({ ping: true }, 1);
    expect(screams).toHaveLength(0);
  });
});

describe('Sprinter', () => {
  it('runs twice as fast as a Stalker and ignores footsteps', () => {
    const rows = [
      '###############',
      '#.............#',
      '#.P.........H.#',
      '#.............#',
      '###############',
    ];
    const sprint = simFromAscii(rows, { hunters: ['sprinter'] });
    let heard = 0;
    sprint.events.on('hunterHeard', () => heard++);
    for (let i = 0; i < 60; i++) sprint.step({ ...IDLE_INPUT, moveX: 1 }, DT);
    expect(heard).toBe(0); // walked toward it: footsteps don't count for a Sprinter

    sprint.step({ ...IDLE_INPUT, ping: true }, DT);
    const h = sprint.state.hunters[0];
    for (let i = 0; i < 60 && h.state !== 'investigate'; i++) sprint.step(IDLE_INPUT, DT);
    expect(h.state).toBe('investigate');
    const x0 = h.x;
    for (let i = 0; i < 15; i++) sprint.step(IDLE_INPUT, DT);
    expect(Math.abs(h.x - x0) / 0.25).toBeGreaterThan(HUNTER_TYPES.stalker.speed * 1.5);
  });
});
