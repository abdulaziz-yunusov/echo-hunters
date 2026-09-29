import { describe, expect, it } from 'vitest';
import { IDLE_INPUT, type PlayerInput } from '@/sim/playerInput';
import { Tutorial } from '@/scenes/tutorial';
import { simFromAscii } from '../helpers/maps';

const DT = 1 / 60;
const ROOM = ['###################', '#P...C......C...C.#', '###################'];

function setup() {
  const sim = simFromAscii(ROOM);
  const tutorial = new Tutorial(sim);
  const run = (input: Partial<PlayerInput>, seconds: number) => {
    for (let i = 0; i < Math.max(1, Math.round(seconds / DT)); i++) {
      sim.step({ ...IDLE_INPUT, ...input }, DT);
      tutorial.tick(DT);
    }
  };
  return { sim, tutorial, run };
}

describe('Tutorial', () => {
  it('starts by teaching the ping, and waits for it', () => {
    const { tutorial, run } = setup();
    run({}, 5);
    expect(tutorial.text).toMatch(/SPACE/);
  });

  it('moves on once the player does what it says', () => {
    const { tutorial, run } = setup();
    run({}, 2);
    run({ ping: true }, DT);
    run({}, 0.5);
    expect(tutorial.text).toMatch(/Signal Cores/);
  });

  it('never shows a prompt twice, and falls silent when nothing applies', () => {
    const { tutorial, run } = setup();
    const seen: string[] = [];
    const record = () => tutorial.text && seen.at(-1) !== tutorial.text && seen.push(tutorial.text);
    run({}, 2);
    record();
    run({ ping: true }, DT);
    for (let i = 0; i < 40; i++) {
      run({ moveX: 1, sneak: i > 20 }, 0.5);
      record();
    }
    expect(new Set(seen).size).toBe(seen.length);
    expect(seen.length).toBeGreaterThanOrEqual(3);
  });

  it('stops listening once disposed', () => {
    const { tutorial, run } = setup();
    tutorial.dispose();
    run({}, 2);
    run({ ping: true }, DT);
    run({}, 2);
    expect(tutorial.text).toMatch(/SPACE/); // never saw the ping
  });
});
