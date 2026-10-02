import { describe, expect, it } from 'vitest';
import { GAME } from '@/config/game';
import { SOUND_KINDS } from '@/config/sounds';
import { beamCharged } from '@/sim/entities/player';
import type { SoundEmitted } from '@/sim/events';
import { IDLE_INPUT, type PlayerInput } from '@/sim/playerInput';
import { chargedBeam } from '../../helpers/beam';
import { simFromAscii } from '../../helpers/maps';

const DT = 1 / 60;
const { chargeTime, cooldown: beamCooldown } = GAME.abilities.beam;

// Open room; P starts at (336, 112).
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
  const sim = simFromAscii(ROOM, { hunters: [] });
  const sounds: SoundEmitted[] = [];
  sim.events.on('soundEmitted', (s) => {
    if (s.owner === sim.state.player.id) sounds.push(s);
  });
  const step = (input: Partial<PlayerInput> = {}) => sim.step({ ...IDLE_INPUT, ...input }, DT);
  const run = (input: Partial<PlayerInput>, seconds: number) => {
    for (let i = 0; i < Math.round(seconds / DT); i++) step(input);
  };
  const play = (inputs: Partial<PlayerInput>[]) => inputs.forEach(step);
  const pings = () => sounds.filter((s) => s.kind === 'ping' || s.kind === 'pingBeam');
  return { sim, sounds, step, run, play, pings, player: () => sim.state.player };
}

describe('charged ping (Phase 18)', () => {
  it('a tap pings all around when the key comes up', () => {
    const { step, pings } = setup();
    step({ ping: true, pingHeld: true });
    step({ pingHeld: true });
    expect(pings()).toHaveLength(0);
    step();
    expect(pings().map((s) => s.kind)).toEqual(['ping']);
    expect(pings()[0].wave.arc).toBeNull();
  });

  it('a tap shorter than one tick still pings', () => {
    const { step, pings } = setup();
    step({ ping: true });
    expect(pings().map((s) => s.kind)).toEqual(['ping']);
  });

  it('a charged hold fires a beam toward the aim, the width of its sound kind', () => {
    const { play, pings, player } = setup();
    const p = player();
    play(chargedBeam({ x: p.x, y: p.y + 300 })); // straight down
    expect(pings().map((s) => s.kind)).toEqual(['pingBeam']);
    const arc = pings()[0].wave.arc!;
    expect(arc.dir).toBeCloseTo(Math.PI / 2, 9);
    expect((arc.halfAngle * 360) / Math.PI).toBeCloseTo(SOUND_KINDS.pingBeam.arc, 9);
  });

  it('without a pointer, the beam goes the way the player last moved', () => {
    const { run, play, pings } = setup();
    run({ moveX: -1 }, 0.2);
    play(chargedBeam(null));
    expect(pings()[0].wave.arc!.dir).toBeCloseTo(Math.PI, 9);
  });

  it('counts as a ping, and restarts both the beam and the ping cooldowns', () => {
    const { sim, play, player } = setup();
    play(chargedBeam({ x: 0, y: 112 }));
    expect(player().pingsUsed).toBe(1);
    expect(player().beamCooldown).toBeCloseTo(beamCooldown, 5);
    expect(player().pingCooldown).toBeCloseTo(sim.state.rules.pingCooldown, 5);
  });

  it('a long hold without a ready beam fires nothing; a tap still pings', () => {
    const { sim, run, play, step, pings } = setup();
    play(chargedBeam({ x: 0, y: 112 }));
    run({}, sim.state.rules.pingCooldown + 0.1); // the ping is ready again, the beam is not
    play(chargedBeam({ x: 0, y: 112 }));
    expect(pings()).toHaveLength(1);
    step({ ping: true });
    expect(pings().map((s) => s.kind)).toEqual(['pingBeam', 'ping']);
  });

  it('becomes charged only after the charge time', () => {
    const { step, run, player } = setup();
    step({ ping: true, pingHeld: true });
    run({ pingHeld: true }, chargeTime - 2 * DT);
    expect(beamCharged(player())).toBe(false);
    run({ pingHeld: true }, 3 * DT);
    expect(beamCharged(player())).toBe(true);
  });

  it('a charged beam slows the player to sneak speed, but not to silence', () => {
    const { run, step, sounds, player } = setup();
    step({ ping: true, pingHeld: true });
    run({ pingHeld: true }, chargeTime + 0.05);
    const x0 = player().x;
    run({ pingHeld: true, moveX: 1 }, 1);
    expect(player().x - x0).toBeCloseTo(GAME.player.sneakSpeed, -1);
    expect(sounds.some((s) => s.kind === 'step')).toBe(true);
  });
});
