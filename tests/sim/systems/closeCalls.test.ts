import { describe, expect, it } from 'vitest';
import { GAME } from '@/config/game';
import { updateCloseCalls } from '@/sim/systems/closeCalls';
import type { GameEvents } from '@/sim/events';
import { IDLE_INPUT } from '@/sim/playerInput';
import { simFromAscii } from '../../helpers/maps';

const DT = 1 / 60;
const { radius, exitRadius, window } = GAME.closeCall;

/**
 * A player and one hunter the test moves by hand (the AI never runs: only
 * the close-call system is stepped), so each rule is checked on its own.
 */
function setup() {
  const sim = simFromAscii(['###########', '#P.......H#', '###########'], {
    hunters: ['stalker'],
  });
  const events: GameEvents['closeCall'][] = [];
  sim.events.on('closeCall', (e) => events.push(e));
  const { player } = sim.state;
  const hunter = sim.state.hunters[0];
  /** Put the hunter this far to the right of the player. */
  const place = (distance: number) => {
    hunter.x = player.x + distance;
    hunter.y = player.y;
  };
  const wait = (seconds: number) => {
    for (let i = 0; i < Math.round(seconds / DT); i++) {
      sim.state.time += DT;
      player.invulnerable = Math.max(0, player.invulnerable - DT);
      updateCloseCalls(sim);
    }
  };
  place(exitRadius + 100);
  return { sim, events, hunter, place, wait };
}

describe('close calls', () => {
  it('count once when a hunter stays close and the player is not hit', () => {
    const { sim, events, place, wait } = setup();
    place(radius - 5);
    wait(window - 0.1);
    expect(events).toHaveLength(0);
    wait(0.2);
    expect(events).toHaveLength(1);
    expect(events[0].scored).toBe(true);
    expect(sim.state.stats.closeCalls).toBe(1);
    wait(5); // lingering nearby is still the same approach
    expect(events).toHaveLength(1);
  });

  it('count when the hunter passes and walks away', () => {
    const { events, place, wait } = setup();
    place(radius - 5);
    wait(0.3);
    place(exitRadius + 50); // gone before the window ends
    wait(window);
    // Leaving resets the approach: a pass shorter than the window is not a close call.
    expect(events).toHaveLength(0);
  });

  it('re-arm only after the hunter goes beyond the exit distance', () => {
    const { events, place, wait } = setup();
    place(radius - 5);
    wait(window + 0.1);
    place((radius + exitRadius) / 2); // stepped back, but not far
    wait(0.5);
    place(radius - 5);
    wait(window + 0.1);
    expect(events).toHaveLength(1);
    place(exitRadius + 10);
    wait(0.1);
    place(radius - 5);
    wait(window + 0.1);
    expect(events).toHaveLength(2);
  });

  it('need the hunter within the close radius, not just the exit radius', () => {
    const { events, place, wait } = setup();
    place(radius + 5);
    wait(window * 3);
    expect(events).toHaveLength(0);
  });

  it('are spoiled by a hit during the approach', () => {
    const { sim, events, place, wait } = setup();
    place(radius - 5);
    wait(0.5);
    sim.state.player.invulnerable = GAME.player.invulnerableTime; // just got hit
    wait(window * 2);
    expect(events).toHaveLength(0);
  });

  it('never come from a stunned hunter', () => {
    const { events, hunter, place, wait } = setup();
    hunter.state = 'stunned';
    place(radius - 5);
    wait(window * 2);
    expect(events).toHaveLength(0);
  });

  it(`score at most ${GAME.scoring.closeCallMax} times per level`, () => {
    const { sim, events, place, wait } = setup();
    for (let i = 0; i < GAME.scoring.closeCallMax + 2; i++) {
      place(radius - 5);
      wait(window + 0.1);
      place(exitRadius + 10);
      wait(0.1);
    }
    expect(events).toHaveLength(GAME.scoring.closeCallMax + 2);
    expect(events.filter((e) => e.scored)).toHaveLength(GAME.scoring.closeCallMax);
    expect(sim.state.stats.closeCalls).toBe(GAME.scoring.closeCallMax);
  });

  it('run in solo only (a duel has no score)', () => {
    const count = (mode: 'solo' | 'host') => {
      // A Listener never moves: it stands one tile away, close but not touching.
      const sim = simFromAscii(['#####', '#PH.#', '#####'], { hunters: ['listener'], mode });
      let calls = 0;
      sim.events.on('closeCall', () => calls++);
      for (let i = 0; i < Math.round((window + 0.5) / DT); i++) sim.step(IDLE_INPUT, DT);
      return calls;
    };
    expect(count('solo')).toBe(1);
    expect(count('host')).toBe(0);
  });
});
