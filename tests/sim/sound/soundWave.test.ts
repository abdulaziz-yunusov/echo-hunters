import { describe, expect, it } from 'vitest';
import { GAME } from '@/config/game';
import { SOUND_KINDS } from '@/config/sounds';
import type { SoundEmitted } from '@/sim/events';
import { IDLE_INPUT, type PlayerInput } from '@/sim/playerInput';
import type { Simulation } from '@/sim/simulation';
import { polygonArea } from '../../helpers/geometry';
import { simFromAscii } from '../../helpers/maps';

const DT = 1 / 60;
const pings = (sim: Simulation) => sim.state.waves.filter((w) => w.kind === 'ping');
const ROOM = [
  '#####################',
  '#...................#',
  '#...................#',
  '#.........P.........#',
  '#...................#',
  '#...................#',
  '#####################',
];

function setup() {
  const sim = simFromAscii(ROOM);
  const sounds: SoundEmitted[] = [];
  // Only the player's own noise; the (unreachable) beacon of test maps pulses too.
  sim.events.on('soundEmitted', (s) => s.owner === sim.state.player.id && sounds.push(s));
  const step = (input: Partial<PlayerInput> = {}) => sim.step({ ...IDLE_INPUT, ...input }, DT);
  const wait = (seconds: number) => {
    for (let i = 0; i < Math.round(seconds / DT); i++) step();
  };
  return { sim, sounds, step, wait };
}

describe('sound waves', () => {
  it('a ping starts a wave at the player that grows at the ping speed', () => {
    const { sim, step } = setup();
    step({ ping: true });
    const [wave] = pings(sim);
    expect(wave).toMatchObject({ kind: 'ping', x: sim.state.player.x, y: sim.state.player.y });
    expect(wave.radius).toBeCloseTo(SOUND_KINDS.ping.speed * DT, 9);
  });

  it('a wave disappears once it reaches its full size', () => {
    const { sim, step, wait } = setup();
    step({ ping: true });
    const { maxRadius, speed } = SOUND_KINDS.ping;
    wait(maxRadius / speed - 2 * DT);
    expect(pings(sim)).toHaveLength(1);
    wait(3 * DT);
    expect(pings(sim)).toHaveLength(0);
  });

  it('ping has a cooldown', () => {
    const { sim, sounds, step, wait } = setup();
    step({ ping: true });
    wait(1);
    step({ ping: true }); // too early: ignored
    wait(GAME.abilities.ping.cooldown);
    step({ ping: true });
    expect(sounds.filter((s) => s.kind === 'ping')).toHaveLength(2);
    expect(sim.state.player.pingsUsed).toBe(2);
  });

  it('every sound event carries its wave, with a real visibility area', () => {
    const { sounds, step } = setup();
    step({ ping: true });
    expect(sounds[0].wave.id).toBeGreaterThan(0);
    expect(polygonArea(sounds[0].wave.polygon)).toBeGreaterThan(1000);
  });

  it('footsteps and wall bumps create waves too, even right at a wall', () => {
    const { sounds, wait, sim } = setup();
    for (let i = 0; i < 300; i++) sim.step({ ...IDLE_INPUT, moveX: 1 }, DT);
    wait(0.1);
    const bump = sounds.find((s) => s.kind === 'wallBump')!;
    expect(sounds.some((s) => s.kind === 'step')).toBe(true);
    // Started 1 px off the wall: its polygon is a real half-disc, not a sliver.
    const r = SOUND_KINDS.wallBump.maxRadius;
    expect(polygonArea(bump.wave.polygon)).toBeGreaterThan(Math.PI * r * r * 0.4);
  });

  it('wave ids are unique', () => {
    const { sounds, step, wait } = setup();
    step({ ping: true });
    wait(GAME.abilities.ping.cooldown);
    step({ ping: true });
    const ids = sounds.map((s) => s.wave.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
