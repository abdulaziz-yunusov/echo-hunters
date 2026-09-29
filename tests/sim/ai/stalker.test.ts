import { describe, expect, it } from 'vitest';
import { GAME } from '@/config/game';
import { HUNTER_COMMON } from '@/config/hunters';
import { Rng } from '@/core/rng';
import { setHunterState } from '@/sim/ai/hunterBrain';
import type { GameEvents } from '@/sim/events';
import { IDLE_INPUT, type PlayerInput } from '@/sim/playerInput';
import { createSimulation, type Simulation } from '@/sim/simulation';
import { simFromAscii } from '../../helpers/maps';

const DT = 1 / 60;

// Open room: the Stalker starts 11 tiles (352 px) right of the player.
const ROOM = [
  '###############',
  '#.............#',
  '#.P.........H.#',
  '#.............#',
  '###############',
];

function setup(rows = ROOM) {
  const sim = simFromAscii(rows, { hunters: ['stalker'] });
  const hits: GameEvents['playerHit'][] = [];
  const hitTimes: number[] = [];
  sim.events.on('playerHit', (e) => {
    hits.push(e);
    hitTimes.push(sim.state.time);
  });
  const run = (
    input: Partial<PlayerInput>,
    seconds: number,
    until?: (s: Simulation) => boolean,
  ) => {
    for (let i = 0; i < Math.round(seconds / DT); i++) {
      sim.step({ ...IDLE_INPUT, ...input }, DT);
      if (until?.(sim)) return;
    }
  };
  return { sim, hits, hitTimes, run, hunter: () => sim.state.hunters[0] };
}

const gap = (sim: Simulation) => {
  const p = sim.state.player;
  const h = sim.state.hunters[0];
  return Math.hypot(p.x - h.x, p.y - h.y);
};

describe('Stalker', () => {
  it('wanders and leaves footsteps while idle', () => {
    const { sim, run, hunter } = setup();
    const steps: number[] = [];
    sim.events.on('soundEmitted', (s) => s.kind === 'hunterStep' && steps.push(s.time));
    run({}, 8);
    expect(hunter().state).toBe('idle');
    expect(steps.length).toBeGreaterThan(0);
  });

  it('hears a ping, walks to where it came from, then searches', () => {
    const { sim, run, hunter } = setup();
    const origin = { x: sim.state.player.x, y: sim.state.player.y };
    run({ ping: true }, DT);
    run({}, 1.5, () => hunter().state === 'investigate');
    expect(hunter().state).toBe('investigate');
    expect(hunter().lastHeard).toEqual(origin);

    // Step aside so it doesn't bump into us, and let it arrive.
    run({ moveY: 1, sneak: true }, 0.4);
    run({}, 6, () => hunter().state === 'search');
    expect(hunter().state).toBe('search');
    expect(Math.hypot(hunter().x - origin.x, hunter().y - origin.y)).toBeLessThan(24);
  });

  it('gives up the search after searchTime and goes back to idle', () => {
    const { run, hunter, sim } = setup();
    run({ ping: true }, DT);
    run({ moveY: 1, sneak: true }, 0.4);
    run({}, 8, () => hunter().state === 'search');
    const started = sim.state.time;
    run({}, 10, () => hunter().state === 'idle');
    expect(hunter().state).toBe('idle');
    expect(sim.state.time - started).toBeCloseTo(4, 0);
  });

  it('never notices a player who only sneaks', () => {
    const { run, hunter, hits } = setup();
    for (let i = 0; i < 6; i++) {
      run({ moveX: i % 2 ? -1 : 1, sneak: true }, 1.5);
      expect(['idle']).toContain(hunter().state);
    }
    expect(hits).toHaveLength(0);
  });

  it('hits on touch: 1 damage, knockback, then a moment of safety', () => {
    const { sim, run, hits, hunter } = setup();
    run({ ping: true }, DT);
    run({}, 8, () => hits.length > 0);
    expect(hits).toHaveLength(1);
    expect(sim.state.player.hp).toBe(GAME.player.hp - HUNTER_COMMON.attackDamage);
    expect(sim.state.player.invulnerable).toBeGreaterThan(0);
    expect(hunter().state).toBe('attack');

    const before = gap(sim);
    run({}, 0.2);
    expect(gap(sim)).toBeGreaterThan(before + 10); // knocked away
  });

  it('cannot hit again while the player is protected', () => {
    const { run, hitTimes } = setup();
    for (let i = 0; i < 8; i++) run({ ping: true }, GAME.abilities.ping.cooldown + 0.1);
    expect(hitTimes.length).toBeGreaterThan(1); // otherwise the check below proves nothing
    for (let i = 1; i < hitTimes.length; i++) {
      expect(hitTimes[i] - hitTimes[i - 1]).toBeGreaterThanOrEqual(GAME.player.invulnerableTime);
    }
  });

  it('can kill: a player who keeps pinging in place dies and the round ends', () => {
    const { sim, run, hits } = setup();
    const ended: string[] = [];
    sim.events.on('roundEnded', (e) => ended.push(e.status));
    for (let i = 0; i < 20 && sim.state.status === 'playing'; i++) {
      run({ ping: true }, GAME.abilities.ping.cooldown + 0.1);
    }
    expect(hits).toHaveLength(GAME.player.hp);
    expect(sim.state.player.hp).toBe(0);
    expect(sim.state.status).toBe('dead');
    expect(ended).toEqual(['dead']);
  });

  it('a stunned hunter ignores sounds until it recovers', () => {
    const { sim, run, hunter } = setup();
    setHunterState(sim, hunter(), 'stunned');
    run({ ping: true }, DT);
    run({}, 2);
    expect(hunter().state).toBe('stunned');
    run({}, HUNTER_COMMON.stunTime);
    expect(hunter().state).not.toBe('stunned');
  });

  it('is deterministic: same seed and inputs, same hunt', () => {
    const play = () => {
      const sim = createSimulation({ seed: 77, level: 1 });
      const rng = new Rng(1);
      for (let i = 0; i < 60 * 30; i++) {
        sim.step(
          { ...IDLE_INPUT, moveX: rng.int(-1, 1), moveY: rng.int(-1, 1), ping: i % 180 === 0 },
          DT,
        );
      }
      return sim.state.hunters.map((h) => [h.x, h.y, h.state]);
    };
    expect(play()).toEqual(play());
  });
});

describe('hunters on real maps', () => {
  it('never overlap walls, whatever they are doing', () => {
    const sim = createSimulation({ seed: 5, level: 4 });
    const { tiles } = sim.state.layout;
    const rng = new Rng(2);
    const ts = tiles.tileSize;
    for (let i = 0; i < 60 * 60 && sim.state.status === 'playing'; i++) {
      sim.step(
        { ...IDLE_INPUT, moveX: rng.int(-1, 1), moveY: rng.int(-1, 1), ping: rng.chance(0.02) },
        DT,
      );
      for (const h of sim.state.hunters) {
        for (let ty = tiles.toTile(h.y - h.radius); ty <= tiles.toTile(h.y + h.radius); ty++) {
          for (let tx = tiles.toTile(h.x - h.radius); tx <= tiles.toTile(h.x + h.radius); tx++) {
            if (!tiles.isWall(tx, ty)) continue;
            const cx = Math.min(Math.max(h.x, tx * ts), (tx + 1) * ts);
            const cy = Math.min(Math.max(h.y, ty * ts), (ty + 1) * ts);
            expect(Math.hypot(h.x - cx, h.y - cy)).toBeGreaterThan(h.radius - 1e-6);
          }
        }
      }
    }
  });
});
