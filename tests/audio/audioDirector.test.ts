import { describe, expect, it } from 'vitest';
import { AudioDirector } from '@/audio/audioDirector';
import type { PlayOptions, SoundOutput } from '@/audio/soundOutput';
import type { SynthName } from '@/config/audio';
import { setHunterState } from '@/sim/ai/hunterBrain';
import { IDLE_INPUT, type PlayerInput } from '@/sim/playerInput';
import type { SimulationOptions } from '@/sim/simulation';
import { simFromAscii } from '../helpers/maps';

const DT = 1 / 60;

/** Records what the director asks for, instead of making sound. */
class FakeOutput implements SoundOutput {
  played: (PlayOptions & { synth: SynthName })[] = [];
  drone: number[] = [];
  droneStopped = 0;
  play(synth: SynthName, o: PlayOptions): void {
    this.played.push({ synth, ...o });
  }
  setDrone(closeness: number): void {
    this.drone.push(closeness);
  }
  stopDrone(): void {
    this.droneStopped++;
  }
  of(synth: SynthName) {
    return this.played.filter((p) => p.synth === synth);
  }
}

function setup(rows: string[], options: SimulationOptions = {}) {
  const sim = simFromAscii(rows, options);
  const out = new FakeOutput();
  const director = new AudioDirector(sim, out, () => 0.5);
  const run = (input: Partial<PlayerInput>, seconds: number) => {
    for (let i = 0; i < Math.max(1, Math.round(seconds / DT)); i++) {
      sim.step({ ...IDLE_INPUT, ...input }, DT);
      director.tick();
    }
  };
  return { sim, out, director, run };
}

// A hunter on each side of the player, in a wide open room.
const ROOM = [
  '#####################',
  '#...................#',
  '#...H.....P.....H...#',
  '#...................#',
  '#####################',
];
// The hunter is close but behind a wall.
const WALLED = ['#########', '#...P...#', '#########', '#...H...#', '#########'];

describe('AudioDirector', () => {
  it("plays the player's own sounds centered and full", () => {
    const { out, run } = setup(ROOM);
    run({ ping: true }, DT);
    const [ping] = out.of('ping');
    expect(ping).toMatchObject({ pan: 0, muffled: false });
    expect(ping.gain).toBeGreaterThan(0.5);
  });

  it('pans hunter footsteps to the side they are on', () => {
    const { sim, out } = setup(ROOM, { hunters: ['stalker', 'stalker'] });
    const [left, right] = sim.state.hunters;
    sim.emitSound('hunterStep', left.x, left.y, left.id);
    sim.emitSound('hunterStep', right.x, right.y, right.id);
    const [l, r] = out.of('hunterStep');
    expect(l.pan).toBeLessThan(-0.5);
    expect(r.pan).toBeGreaterThan(0.5);
  });

  it('gets quieter with distance and goes silent out of range', () => {
    const { sim, out } = setup(ROOM);
    const p = sim.state.player;
    sim.emitSound('hunterStep', p.x + 50, p.y, 999);
    sim.emitSound('hunterStep', p.x + 250, p.y, 999);
    sim.emitSound('hunterStep', p.x + 5000, p.y, 999);
    const steps = out.of('hunterStep');
    expect(steps).toHaveLength(2);
    expect(steps[0].gain).toBeGreaterThan(steps[1].gain);
  });

  it('muffles sounds from behind walls', () => {
    const { sim, out } = setup(WALLED, { hunters: ['stalker'] });
    const h = sim.state.hunters[0];
    sim.emitSound('hunterStep', h.x, h.y, h.id);
    const [step] = out.of('hunterStep');
    expect(step.muffled).toBe(true);
  });

  it('the drone rises as a hunter comes close, and is calm otherwise', () => {
    const { sim, out, run } = setup(ROOM, { hunters: ['stalker'] });
    for (const h of sim.state.hunters) setHunterState(sim, h, 'stunned');
    run({}, DT);
    expect(out.drone.at(-1)).toBe(0); // 192 px away: out of the drone range
    const h = sim.state.hunters[0];
    h.x = sim.state.player.x - 60;
    run({}, DT);
    expect(out.drone.at(-1)).toBeGreaterThan(0.5);
  });

  it('plays feedback for game events, and stops the drone when the round ends', () => {
    const rows = ['#########', '#P.C..B.#', '#########'];
    const { out, run } = setup(rows);
    run({ moveX: 1 }, 3);
    expect(out.of('coreCollected')).toHaveLength(1);
    expect(out.of('beaconOn')).toHaveLength(1);
    expect(out.of('extract')).toHaveLength(1);
    expect(out.droneStopped).toBeGreaterThan(0);
  });

  it('stops listening once disposed', () => {
    const { out, run, director } = setup(ROOM);
    director.dispose();
    run({ ping: true }, DT);
    expect(out.played).toHaveLength(0);
  });
});
