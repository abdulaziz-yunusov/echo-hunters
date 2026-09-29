import { describe, expect, it } from 'vitest';
import { GAME } from '@/config/game';
import type { SoundEmitted } from '@/sim/events';
import { IDLE_INPUT, type PlayerInput } from '@/sim/playerInput';
import type { SimulationOptions } from '@/sim/simulation';
import { simFromAscii, TS } from '../../helpers/maps';

const DT = 1 / 60;
const { throwRange, flightTime, radius } = GAME.abilities.stone;
const SPEED = throwRange / flightTime;

// Floor x 32..640, y 32..192. P at (336, 112).
const ROOM = [
  '#####################',
  '#...................#',
  '#...................#',
  '#.........P.........#',
  '#...................#',
  '#...................#',
  '#####################',
];

function setup(rows = ROOM, options: SimulationOptions = {}) {
  const sim = simFromAscii(rows, options);
  const sounds: SoundEmitted[] = [];
  sim.events.on('soundEmitted', (s) => s.owner === sim.state.player.id && sounds.push(s));
  const run = (input: Partial<PlayerInput>, seconds: number) => {
    for (let i = 0; i < Math.max(1, Math.round(seconds / DT)); i++) {
      sim.step({ ...IDLE_INPUT, ...input }, DT);
    }
  };
  const impacts = () => sounds.filter((s) => s.kind === 'stoneImpact');
  return { sim, sounds, run, impacts, p: () => sim.state.player };
}

describe('decoy stone', () => {
  it('flies silently to the aim point, then makes a ping-like sound there', () => {
    const { sim, run, impacts, sounds, p } = setup();
    const from = { x: p().x, y: p().y };
    run({ throwStone: true, aim: { x: from.x + 200, y: from.y } }, DT);
    expect(p().stones).toBe(GAME.player.startStones - 1);
    expect(sim.state.stones).toHaveLength(1);

    run({}, 200 / SPEED - 3 * DT);
    expect(sounds).toHaveLength(0); // still in the air

    run({}, 5 * DT);
    expect(impacts()).toHaveLength(1);
    expect(impacts()[0].x).toBeCloseTo(from.x + 200, 0);
    expect(impacts()[0].y).toBeCloseTo(from.y, 5);
    expect(sim.state.stones).toHaveLength(0);
  });

  it('cannot be thrown further than its range', () => {
    const { run, impacts, p } = setup();
    const x0 = p().x;
    run({ throwStone: true, aim: { x: x0 + 1000, y: p().y } }, 1);
    expect(impacts()[0].x).toBeCloseTo(x0 + throwRange, 0);
  });

  it('stops at the first wall, landing in front of it', () => {
    const { run, impacts, p } = setup();
    run({ throwStone: true, aim: { x: p().x, y: -500 } }, 1);
    expect(impacts()[0].y).toBeCloseTo(TS + radius, 3);
  });

  it('without a pointer, it goes the way the player last moved', () => {
    const { run, impacts, p } = setup();
    run({ moveX: -1 }, 0.2);
    const x0 = p().x;
    run({ throwStone: true, aim: null }, 1);
    expect(impacts()[0].x).toBeCloseTo(x0 - throwRange, 0);
  });

  it('needs stones', () => {
    const { run, impacts, p } = setup();
    p().stones = 0;
    run({ throwStone: true, aim: { x: 0, y: 0 } }, 1);
    expect(impacts()).toHaveLength(0);
  });

  it('does not count as a ping (the ghost bonus allows decoys)', () => {
    const { run, p } = setup();
    run({ throwStone: true, aim: { x: 100, y: 100 } }, 1);
    expect(p().pingsUsed).toBe(0);
  });

  it('draws a Stalker to where it landed, not to the player', () => {
    // The Stalker (x 432) is 352 px from the player (x 80): out of footstep range.
    const rows = [
      '###############',
      '#.............#',
      '#.P.........H.#',
      '#.............#',
      '###############',
    ];
    const { sim, run, impacts } = setup(rows, { hunters: ['stalker'] });
    const h = () => sim.state.hunters[0];
    run({ throwStone: true, aim: { x: 330, y: 80 } }, DT);
    run({}, 1.5);
    const landed = impacts()[0];
    expect(h().lastHeard).toEqual({ x: landed.x, y: landed.y });
    run({}, 2);
    const toStone = Math.hypot(h().x - landed.x, h().y - landed.y);
    const toPlayer = Math.hypot(h().x - sim.state.player.x, h().y - sim.state.player.y);
    expect(toStone).toBeLessThan(40);
    expect(toPlayer).toBeGreaterThan(200);
  });
});
