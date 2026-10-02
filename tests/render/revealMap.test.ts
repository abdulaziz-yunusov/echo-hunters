import { describe, expect, it } from 'vitest';
import { RevealMap } from '@/render/revealMap';
import { IDLE_INPUT } from '@/sim/playerInput';
import { chargedBeam } from '../helpers/beam';
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

describe('RevealMap objects', () => {
  // Object in the top corridor (in line of sight) and one in the hidden lower corridor.
  const seen = { key: 'seen', x: 9.5 * TS, y: 1.5 * TS };
  const hidden = { key: 'hidden', x: 1.5 * TS, y: 3.5 * TS };

  function run(seconds: number) {
    const sim = simFromAscii(MAP);
    const reveal = new RevealMap(sim.state.walls);
    sim.events.on('soundEmitted', (s) => reveal.addWave(s.wave));
    const times: number[] = [];
    for (let i = 0; i < Math.round(seconds / DT); i++) {
      sim.step({ ...IDLE_INPUT, ping: i === 0 }, DT);
      reveal.update(sim.state.time);
      const before = reveal.objectRevealTime('seen');
      reveal.revealObjects(sim.state.waves, [seen, hidden], sim.state.time, DT);
      if (reveal.objectRevealTime('seen') !== before) times.push(sim.state.time);
    }
    return { sim, reveal, times };
  }

  it('lights an object once, when the ring front passes it', () => {
    const { times } = run(1.5);
    expect(times).toHaveLength(1);
    const distance = seen.x - 1.5 * TS;
    expect(times[0]).toBeCloseTo(distance / 350, 1);
  });

  it('never lights an object hidden behind walls', () => {
    const { reveal } = run(1.5);
    expect(reveal.objectRevealTime('hidden')).toBe(-Infinity);
  });

  it("lights a sound's own source on its first tick", () => {
    const { sim } = run(DT);
    const p = sim.state.player;
    const reveal = new RevealMap(sim.state.walls);
    reveal.revealObjects(sim.state.waves, [{ key: 'src', x: p.x, y: p.y }], sim.state.time, DT);
    expect(reveal.objectRevealTime('src')).toBe(sim.state.time);
  });
});

describe('RevealMap and a beam (Phase 18)', () => {
  function beamAndWait(aimX: number) {
    const sim = simFromAscii(MAP);
    const reveal = new RevealMap(sim.state.walls);
    sim.events.on('soundEmitted', (s) => reveal.addWave(s.wave));
    const p = sim.state.player;
    for (const input of [...chargedBeam({ x: aimX, y: p.y }), ...Array(120).fill({})]) {
      sim.step({ ...IDLE_INPUT, ...input }, DT);
      reveal.update(sim.state.time);
    }
    const revealed = (ax: number, ay: number, bx: number, by: number) => {
      const i = sim.state.walls.edges.findIndex(
        (e) =>
          (e.ax === ax && e.ay === ay && e.bx === bx && e.by === by) ||
          (e.ax === bx && e.ay === by && e.bx === ax && e.by === ay),
      );
      expect(i).toBeGreaterThanOrEqual(0);
      return reveal.revealTime[i] > -Infinity;
    };
    return { revealed };
  }
  const farEnd = [10 * TS, TS, 10 * TS, 2 * TS] as const;
  const nearEnd = [TS, TS, TS, 2 * TS] as const;
  const ceilingAbove = [TS, TS, 2 * TS, TS] as const;

  it('reveals only the walls in the direction it was aimed', () => {
    const right = beamAndWait(1000);
    expect(right.revealed(...farEnd)).toBe(true);
    expect(right.revealed(...nearEnd)).toBe(false);
    expect(right.revealed(...ceilingAbove)).toBe(false);

    const left = beamAndWait(0);
    expect(left.revealed(...nearEnd)).toBe(true);
    expect(left.revealed(...farEnd)).toBe(false);
  });
});
