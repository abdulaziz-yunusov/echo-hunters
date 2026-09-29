import { describe, expect, it } from 'vitest';
import { RevealMap } from '@/render/revealMap';
import { IDLE_INPUT } from '@/sim/playerInput';
import { simFromAscii, TS } from '../helpers/maps';

const DT = 1 / 60;

// A corridor that turns back under itself: row 3 is hidden behind the wall row 2.
const MAP = ['###########', '#P........#', '#########.#', '#.........#', '###########'];

function pingAndWait(seconds: number) {
  const sim = simFromAscii(MAP);
  const reveal = new RevealMap(sim.state.walls);
  sim.events.on('soundEmitted', (s) => reveal.addWave(s.wave));
  sim.step({ ...IDLE_INPUT, ping: true }, DT);
  reveal.update(sim.state.time);
  for (let i = 0; i < Math.round(seconds / DT); i++) {
    sim.step(IDLE_INPUT, DT);
    reveal.update(sim.state.time);
  }
  const edgeAt = (ax: number, ay: number, bx: number, by: number) =>
    sim.state.walls.edges.findIndex(
      (e) => e.ax === ax && e.ay === ay && e.bx === bx && e.by === by,
    );
  return { sim, reveal, edgeAt };
}

describe('RevealMap', () => {
  it('reveals nearer walls before farther ones', () => {
    const { reveal, edgeAt } = pingAndWait(1.5);
    const near = edgeAt(TS, TS, 2 * TS, TS); // ceiling just above the player
    const far = edgeAt(10 * TS, TS, 10 * TS, 2 * TS); // end wall of the corridor, 272 px away
    expect(reveal.revealTime[near]).toBeGreaterThan(-Infinity);
    expect(reveal.revealTime[far]).toBeGreaterThan(reveal.revealTime[near]);
  });

  it('reveals a wall when the ring reaches it, not before', () => {
    const { reveal, edgeAt } = pingAndWait(1.5);
    const far = edgeAt(10 * TS, TS, 10 * TS, 2 * TS);
    const distance = 10 * TS - 1.5 * TS; // from the player center to the wall face
    const expected = distance / 350; // ping speed
    expect(reveal.revealTime[far]).toBeGreaterThanOrEqual(expected - DT);
    expect(reveal.revealTime[far]).toBeLessThanOrEqual(expected + 2 * DT);
  });

  it('never reveals walls hidden behind other walls', () => {
    const { reveal, edgeAt } = pingAndWait(1.5);
    // Floor of the hidden lower corridor, right under the player.
    const hidden = edgeAt(TS, 4 * TS, 2 * TS, 4 * TS);
    expect(hidden).toBeGreaterThanOrEqual(0);
    expect(reveal.revealTime[hidden]).toBe(-Infinity);
  });

  it('never reveals the back face of a wall', () => {
    const { reveal, edgeAt } = pingAndWait(1.5);
    // Underside of the separating wall faces the hidden corridor.
    const back = edgeAt(2 * TS, 3 * TS, 3 * TS, 3 * TS);
    expect(back).toBeGreaterThanOrEqual(0);
    expect(reveal.revealTime[back]).toBe(-Infinity);
  });

  it('stops tracking a wave once it has revealed everything it can', () => {
    const { reveal } = pingAndWait(1.5);
    expect(reveal.activeWaves).toBe(0);
  });
});
