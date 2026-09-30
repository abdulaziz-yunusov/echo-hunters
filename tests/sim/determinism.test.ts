import { describe, expect, it } from 'vitest';
import { Rng } from '@/core/rng';
import type { PlayerInput } from '@/sim/playerInput';
import { createSimulation, type Simulation } from '@/sim/simulation';

const DT = 1 / 60;

/** A restless fake player: wanders, sneaks, pings, throws and shocks, all from one seed. */
function scriptedInputs(seed: number, ticks: number): PlayerInput[] {
  const rng = new Rng(seed);
  const inputs: PlayerInput[] = [];
  let moveX = 0;
  let moveY = 0;
  for (let i = 0; i < ticks; i++) {
    if (i % 30 === 0) {
      const angle = rng.range(0, Math.PI * 2);
      moveX = Math.cos(angle);
      moveY = Math.sin(angle);
    }
    inputs.push({
      moveX,
      moveY,
      sneak: rng.chance(0.2),
      ping: rng.chance(0.01),
      throwStone: rng.chance(0.005),
      shockwave: rng.chance(0.005),
      aim: { x: rng.range(0, 1300), y: rng.range(0, 800) },
    });
  }
  return inputs;
}

/** Everything that tells two rounds apart, as one string. */
function fingerprint(sim: Simulation): string {
  const s = sim.state;
  return JSON.stringify({
    tick: s.tick,
    status: s.status,
    player: [s.player.x, s.player.y, s.player.hp, s.player.cores, s.player.stones],
    hunters: s.hunters.map((h) => [h.x, h.y, h.state, h.goal]),
    waves: s.waves.map((w) => [w.kind, w.x, w.y, w.radius]),
    rng: s.rng.state,
    stuns: s.stats.huntersStunned,
  });
}

function play(level: number, seed: number, ticks: number): { sim: Simulation; prints: string[] } {
  const sim = createSimulation({ seed, level });
  const prints: string[] = [];
  scriptedInputs(seed, ticks).forEach((input, i) => {
    sim.step(input, DT);
    if (i % 600 === 0) prints.push(fingerprint(sim));
  });
  prints.push(fingerprint(sim));
  return { sim, prints };
}

/**
 * Replays, daily seeds and duels rely on this: the same map and the same
 * inputs must always play out exactly the same way.
 */
describe('determinism', () => {
  it.each([
    [3, 11],
    [6, 12345],
  ])('level %i, seed %i: two runs with the same inputs match tick for tick', (level, seed) => {
    const a = play(level, seed, 60 * 40);
    const b = play(level, seed, 60 * 40);
    expect(b.prints).toEqual(a.prints);
    // The script really exercised the game (not a trivially idle round).
    expect(a.sim.state.player.pingsUsed).toBeGreaterThan(0);
  });
});
