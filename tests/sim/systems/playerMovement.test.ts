import { describe, expect, it } from 'vitest';
import { GAME } from '@/config/game';
import type { SoundEmitted } from '@/sim/events';
import { IDLE_INPUT, type PlayerInput } from '@/sim/playerInput';
import type { Simulation } from '@/sim/simulation';
import { simFromAscii, TS } from '../../helpers/maps';

const DT = 1 / 60;
const { speed, sneakSpeed, footstepInterval, radius } = GAME.player;
const STRIDE = speed * footstepInterval;

// Floor x from 32 to 640 (right wall face at x = 640). P starts at x = 336, y = 112.
const ROOM = [
  '#####################',
  '#...................#',
  '#...................#',
  '#.........P.........#',
  '#...................#',
  '#...................#',
  '#####################',
];

function setup(rows = ROOM) {
  const sim = simFromAscii(rows);
  const sounds: SoundEmitted[] = [];
  // Only the player's own noise; the (unreachable) beacon of test maps pulses too.
  sim.events.on('soundEmitted', (s) => s.owner === sim.state.player.id && sounds.push(s));
  const run = (input: Partial<PlayerInput>, seconds: number) => {
    for (let i = 0; i < Math.round(seconds / DT); i++) sim.step({ ...IDLE_INPUT, ...input }, DT);
  };
  const count = (kind: string) => sounds.filter((s) => s.kind === kind).length;
  return { sim, sounds, run, count, player: () => sim.state.player };
}

const startX = (sim: Simulation) => sim.state.player.x;

describe('player movement', () => {
  it('walks at the configured speed', () => {
    const { sim, run } = setup();
    const x0 = startX(sim);
    run({ moveX: 1 }, 1);
    expect(sim.state.player.x - x0).toBeCloseTo(speed, 6);
  });

  it('diagonal movement is not faster', () => {
    const { sim, run } = setup();
    const { x, y } = sim.state.player;
    run({ moveX: 1, moveY: -1 }, 0.5); // short enough not to reach the top wall
    const p = sim.state.player;
    expect(Math.hypot(p.x - x, p.y - y)).toBeCloseTo(speed * 0.5, 6);
  });

  it('sneaks at the sneak speed, silently', () => {
    const { sim, run, sounds } = setup();
    const x0 = startX(sim);
    run({ moveX: 1, sneak: true }, 1);
    expect(sim.state.player.x - x0).toBeCloseTo(sneakSpeed, 6);
    expect(sim.state.player.sneaking).toBe(true);
    expect(sounds).toHaveLength(0);
  });

  it('keeps previous position for smooth drawing', () => {
    const { run, player } = setup();
    run({ moveX: 1 }, DT);
    expect(player().x - player().prevX).toBeCloseTo(speed * DT, 9);
  });
});

describe('footsteps', () => {
  it('one step per stride while walking (every footstepInterval at walking speed)', () => {
    const { run, count } = setup();
    run({ moveX: 1 }, 1);
    expect(count('step')).toBe(Math.floor(speed / STRIDE));
  });

  it('standing still makes no steps', () => {
    const { run, sounds } = setup();
    run({}, 3);
    expect(sounds).toHaveLength(0);
  });

  it('tapping the move key cannot dodge footsteps', () => {
    const { run, count } = setup();
    // 10 short taps, each shorter than one footstep interval.
    for (let i = 0; i < 10; i++) {
      run({ moveX: i % 2 ? 1 : -1 }, 0.2);
      run({}, DT);
    }
    expect(count('step')).toBe(Math.floor((10 * speed * 0.2) / STRIDE));
  });

  it('steps are emitted at the player and owned by it', () => {
    const { run, sounds, player } = setup();
    run({ moveX: 1 }, 0.5);
    expect(sounds[0]).toMatchObject({ kind: 'step', owner: player().id, y: player().y });
  });
});

describe('wall bump', () => {
  it('walking into a wall bumps once, however long you push', () => {
    const { run, sounds, count } = setup();
    run({ moveX: 1 }, 5);
    expect(count('wallBump')).toBe(1);
    const bump = sounds.find((s) => s.kind === 'wallBump')!;
    expect(bump.x).toBeCloseTo(20 * TS - 1); // 1 px in front of the wall face
  });

  it('the player stops at the wall with its edge touching it', () => {
    const { run, player } = setup();
    run({ moveX: 1 }, 5);
    expect(player().x).toBeCloseTo(20 * TS - radius);
  });

  it('sneaking into a wall is silent', () => {
    const { run, sounds } = setup();
    run({ moveX: 1, sneak: true }, 6);
    expect(sounds).toHaveLength(0);
  });

  it('brushing along a wall at 45 degrees does not bump', () => {
    // Impact speed = 140 * cos(45) = 99 px/s, just under the 100 px/s threshold.
    const { run, count } = setup([
      '#####################',
      '#.........P.........#',
      '#...................#',
      '#####################',
    ]);
    run({ moveX: 1, moveY: -1 }, 1);
    expect(count('wallBump')).toBe(0);
  });

  it('bumps again after leaving the wall and hitting it again', () => {
    const { run, count } = setup();
    run({ moveX: 1 }, 3);
    run({ moveX: -1 }, 0.6);
    run({ moveX: 1 }, 1);
    expect(count('wallBump')).toBe(2);
  });
});
