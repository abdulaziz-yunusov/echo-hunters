import { describe, expect, it } from 'vitest';
import { GAME } from '@/config/game';
import { HUNTER_COMMON } from '@/config/hunters';
import type { GameEvents } from '@/sim/events';
import type { HunterTypeId } from '@/config/hunters';
import { IDLE_INPUT, type PlayerInput } from '@/sim/playerInput';
import { simFromAscii } from '../../helpers/maps';

const DT = 1 / 60;

function setup(rows: string[], hunters: HunterTypeId[] = ['stalker', 'stalker']) {
  const sim = simFromAscii(rows, { hunters });
  const stuns: GameEvents['hunterStunned'][] = [];
  const hits: GameEvents['playerHit'][] = [];
  sim.events.on('hunterStunned', (e) => stuns.push(e));
  sim.events.on('playerHit', (e) => hits.push(e));
  const run = (input: Partial<PlayerInput>, seconds: number) => {
    for (let i = 0; i < Math.max(1, Math.round(seconds / DT)); i++) {
      sim.step({ ...IDLE_INPUT, ...input }, DT);
    }
  };
  const shock = () => run({ shockwave: true }, DT);
  return { sim, stuns, hits, run, shock, hunters: () => sim.state.hunters };
}

// Hunter 1 is 96 px away in sight; hunter 2 is 224 px away.
const OPEN = [
  '###############',
  '#.............#',
  '#.P..H...H....#',
  '#.............#',
  '###############',
];
// One hunter, 96 px away in sight.
const ONE = [
  '###############',
  '#.............#',
  '#.P..H........#',
  '#.............#',
  '###############',
];
// Hunter 1 is 64 px away but behind a wall.
const WALLED = ['#######', '#.P...#', '#####.#', '#.H...#', '#######'];

describe('shockwave', () => {
  it('stuns hunters in reach and in sight, and only those', () => {
    const { shock, hunters, stuns } = setup(OPEN);
    shock();
    expect(hunters()[0].state).toBe('stunned');
    expect(hunters()[1].state).not.toBe('stunned');
    expect(stuns).toHaveLength(1);
  });

  it('does not pass through walls', () => {
    const { shock, hunters } = setup(WALLED);
    shock();
    expect(hunters()[0].state).not.toBe('stunned');
  });

  it('has a cooldown', () => {
    const { shock, run, stuns, sim } = setup(OPEN);
    shock();
    run({}, 1);
    shock(); // too early
    expect(stuns).toHaveLength(1);
    run({}, GAME.abilities.shockwave.cooldown);
    shock();
    expect(stuns).toHaveLength(2);
    expect(sim.state.player.shockCooldown).toBeGreaterThan(0);
  });

  it('scores a stun once per hunter per level, so it cannot be farmed', () => {
    // A Listener never moves, so it is still in reach for the second shockwave.
    const { shock, run, stuns, sim } = setup(ONE, ['listener']);
    shock();
    run({}, GAME.abilities.shockwave.cooldown);
    shock();
    expect(stuns.map((s) => s.scored)).toEqual([true, false]);
    expect(sim.state.stats.huntersStunned).toBe(1);
  });

  it('is loud: the red ring gives the player away', () => {
    const { sim, shock } = setup(OPEN);
    const sounds: string[] = [];
    sim.events.on('soundEmitted', (s) => sounds.push(s.kind));
    shock();
    expect(sounds).toContain('shockwave');
  });

  it('lets the player walk straight past a stunned hunter unharmed', () => {
    const { shock, run, hits, sim, hunters } = setup(ONE, ['stalker']);
    shock();
    run({ moveX: 1 }, 1.2); // straight through hunter 1
    expect(sim.state.player.x).toBeGreaterThan(hunters()[0].x + 20);
    expect(hits).toHaveLength(0);
    expect(sim.state.player.hp).toBe(GAME.player.hp);
    expect(HUNTER_COMMON.stunTime).toBeGreaterThan(1.2);
  });
});
