import { describe, expect, it } from 'vitest';
import { Rng } from '@/core/rng';
import { playerSoundSpreading } from '@/sim/ai/behaviours';
import { isPlayerId } from '@/sim/ai/trail';
import { IDLE_INPUT, type PlayerInput } from '@/sim/playerInput';
import { simFromAscii } from '../../helpers/maps';

const DT = 1 / 60;

// The Echo starts 8 tiles (256 px) right of the player.
const ROOM = [
  '####################',
  '#..................#',
  '#..................#',
  '#..P.......H.......#',
  '#..................#',
  '#..................#',
  '####################',
];

function setup() {
  const sim = simFromAscii(ROOM, { hunters: ['echo'] });
  const echo = () => sim.state.hunters[0];
  /** Ticks it moved, and whether a player's ring was growing during each. */
  let moves = 0;
  let movesWithoutSound = 0;
  let rewinds = 0;
  sim.events.on('soundEmitted', (s) => s.kind === 'echoRewind' && rewinds++);
  const step = (input: Partial<PlayerInput>) => {
    // A ring that was growing at the start of the tick, or one the player starts this tick.
    let spreading = playerSoundSpreading(sim.state);
    const off = sim.events.on('soundEmitted', (s) => {
      if (isPlayerId(s.owner)) spreading = true;
    });
    const { x, y } = echo();
    sim.step({ ...IDLE_INPUT, ...input }, DT);
    off();
    if (echo().x !== x || echo().y !== y) {
      moves++;
      if (!spreading) movesWithoutSound++;
    }
  };
  const run = (input: Partial<PlayerInput>, seconds: number) => {
    for (let i = 0; i < Math.round(seconds / DT); i++) step(input);
  };
  return {
    sim,
    echo,
    step,
    run,
    get moves() {
      return moves;
    },
    get movesWithoutSound() {
      return movesWithoutSound;
    },
    get rewinds() {
      return rewinds;
    },
  };
}

describe('Echo', () => {
  it('is frozen while the player is silent, even sneaking right past it', () => {
    const t = setup();
    t.run({}, 3);
    t.run({ moveX: 1, sneak: true }, 3);
    expect(t.moves).toBe(0);
  });

  it('rushes at a ping only while the ring is still growing', () => {
    const t = setup();
    t.run({ ping: true }, 2 * DT);
    t.run({}, 3);
    expect(t.moves).toBeGreaterThan(0);
    expect(t.movesWithoutSound).toBe(0);
    // The ring is gone: frozen again, short of the player.
    const { x } = t.echo();
    t.run({}, 2);
    expect(t.echo().x).toBe(x);
    expect(t.echo().state).toBe('idle');
  });

  it('never moves without a growing player ring, whatever the player does', () => {
    const t = setup();
    const rng = new Rng(19);
    for (let i = 0; i < 40; i++) {
      const input: Partial<PlayerInput> = {
        moveX: rng.range(-1, 1),
        moveY: rng.range(-1, 1),
        sneak: rng.next() < 0.5,
        ping: rng.next() < 0.1,
      };
      t.run(input, 0.25);
      if (t.sim.state.status !== 'playing') break;
    }
    expect(t.moves).toBeGreaterThan(0);
    expect(t.movesWithoutSound).toBe(0);
  });

  it('plays its rewind tell when it starts moving after a still spell', () => {
    const t = setup();
    t.run({ ping: true }, 2 * DT);
    // It hears the ping 256 px away after 0.73 s; the ring lives 1.14 s.
    t.run({}, 1);
    expect(t.rewinds).toBe(1);
    expect(t.echo().state).toBe('investigate');
  });
});
