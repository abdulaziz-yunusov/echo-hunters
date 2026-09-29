import { describe, expect, it } from 'vitest';
import { GAME } from '@/config/game';
import type { GameEvents, SoundEmitted } from '@/sim/events';
import { IDLE_INPUT, type PlayerInput } from '@/sim/playerInput';
import { simFromAscii } from '../../helpers/maps';

const DT = 1 / 60;
const { coreHumInterval, beaconPulseInterval } = GAME.objectives;

function setup(rows: string[]) {
  const sim = simFromAscii(rows);
  const sounds: SoundEmitted[] = [];
  const events: string[] = [];
  sim.events.on('soundEmitted', (s) => sounds.push(s));
  for (const type of ['coreCollected', 'beaconActivated', 'roundEnded'] as (keyof GameEvents)[]) {
    sim.events.on(type, () => events.push(type));
  }
  const run = (input: Partial<PlayerInput>, seconds: number) => {
    for (let i = 0; i < Math.round(seconds / DT); i++) sim.step({ ...IDLE_INPUT, ...input }, DT);
  };
  const count = (kind: string) => sounds.filter((s) => s.kind === kind).length;
  return { sim, events, run, count };
}

// One core between the player and the beacon.
const LINE = ['#############', '#P...C.....B#', '#############'];
// Two cores, one on each side of the player; the beacon is to the right.
const SPLIT = ['###############', '#C....P...C..B#', '###############'];

describe('Signal Cores', () => {
  it('hum at their interval while waiting to be found', () => {
    const { run, count } = setup(LINE);
    run({}, coreHumInterval * 2 + 0.5);
    expect(count('coreHum')).toBe(2);
  });

  it('are collected by walking over them, and then fall silent', () => {
    const { sim, run, count, events } = setup(LINE);
    run({ moveX: 1 }, 1);
    expect(sim.state.player.cores).toBe(1);
    expect(sim.state.cores[0].collected).toBe(true);
    expect(events).toContain('coreCollected');
    run({}, coreHumInterval * 2);
    expect(count('coreHum')).toBe(0);
  });

  it('several cores hum at different moments', () => {
    const { sim } = setup(SPLIT);
    const [a, b] = sim.state.cores;
    expect(a.humTimer).not.toBe(b.humTimer);
  });
});

describe('Extraction Beacon', () => {
  it('stays silent and closed until every core is collected', () => {
    const { sim, run, count } = setup(SPLIT);
    run({ moveX: 1 }, 4); // collects the right core, reaches the beacon
    expect(sim.state.player.cores).toBe(1);
    expect(sim.state.beacon.active).toBe(false);
    expect(count('beacon')).toBe(0);
    expect(sim.state.status).toBe('playing');
  });

  it('wakes when the last core is taken and pulses at its interval', () => {
    const { sim, run, count, events } = setup(SPLIT);
    run({ moveX: -1 }, 2); // left core
    run({ moveX: 1 }, 2.2); // right core (1.94 s), stop short of the beacon (2.63 s)
    expect(sim.state.beacon.active).toBe(true);
    expect(events.filter((e) => e === 'beaconActivated')).toHaveLength(1);
    run({}, beaconPulseInterval * 2 + 0.5);
    expect(count('beacon')).toBe(3); // right away, then twice more
  });

  it('reaching the active beacon extracts, once, and freezes the player', () => {
    const { sim, run, events } = setup(LINE);
    run({ moveX: 1 }, 4);
    expect(sim.state.status).toBe('extracted');
    expect(events.filter((e) => e === 'roundEnded')).toHaveLength(1);

    const { x, y } = sim.state.player;
    run({ moveX: -1, ping: true }, 1);
    expect(sim.state.player).toMatchObject({ x, y });
    expect(events.filter((e) => e === 'roundEnded')).toHaveLength(1);
  });
});
