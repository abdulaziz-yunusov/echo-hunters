import { describe, expect, it } from 'vitest';
import { AUDIO_SOUNDS } from '@/config/audio';
import type { Player } from '@/sim/entities/player';
import { IDLE_INPUT } from '@/sim/playerInput';
import {
  formatDuelTable,
  measureDuels,
  playDuel,
  summarize,
  type DuelRound,
} from '../../tools/balance/duelBalance';
import { parseArgs } from '../../tools/balance/balance';
import { DuelBot } from '../../tools/balance/duelBot';
import { simFromAscii } from '../helpers/maps';

const DT = 1 / 60;

/** A long corridor: the bot (host) at the left P, the rival at the right one, 768 px apart. */
const CORRIDOR = [
  '###########################',
  '#P.......................P#',
  '###########################',
];

function setup(rows = CORRIDOR) {
  const sim = simFromAscii(rows, { mode: 'host', hunters: [] });
  const bot = new DuelBot(sim);
  return { sim, bot, player: sim.state.player, rival: sim.state.rival! };
}

function place(p: Player, x: number, y: number) {
  p.x = p.prevX = x;
  p.y = p.prevY = y;
}

describe('duel bot', () => {
  it("hears the rival's footsteps only within the player's earshot", () => {
    const { sim, bot, player, rival } = setup();
    const range = AUDIO_SOUNDS.step.range;
    sim.emitSound('step', player.x + range + 20, player.y, rival.id);
    expect(bot.lastKnownRival).toBeNull();
    sim.emitSound('step', player.x + range - 20, player.y, rival.id);
    expect(bot.lastKnownRival).toMatchObject({ x: player.x + range - 20, y: player.y });
  });

  it("ignores its own and the hunters' sounds, and the rival's stones (they land elsewhere)", () => {
    const { sim, bot, player, rival } = setup();
    sim.emitSound('step', player.x + 50, player.y, player.id);
    sim.emitSound('hunterStep', player.x + 50, player.y, 100);
    sim.emitSound('stoneImpact', player.x + 50, player.y, rival.id);
    expect(bot.lastKnownRival).toBeNull();
  });

  it('sees the rival when a ring passes over them, never beyond its reach', () => {
    const far = setup();
    far.sim.emitSound('ping', far.player.x, far.player.y, far.player.id);
    for (let i = 0; i < 120; i++) {
      far.sim.step(IDLE_INPUT, DT);
      far.bot.input();
    }
    expect(far.bot.lastKnownRival).toBeNull(); // 768 px: the ping's ring stops at 400

    const near = setup();
    place(near.rival, near.player.x + 300, near.player.y);
    near.sim.emitSound('ping', near.player.x, near.player.y, near.player.id);
    for (let i = 0; i < 120; i++) {
      near.sim.step(IDLE_INPUT, DT);
      near.bot.input();
    }
    expect(near.bot.lastKnownRival).toMatchObject({ x: near.rival.x, y: near.rival.y });
  });

  it('heads for the beacon when the rival carries the cores, and chases them once heard', () => {
    const { sim, bot, player, rival } = setup([
      '##################',
      '#B...P..........P#',
      '##################',
    ]);
    rival.cores = 2;
    sim.step(IDLE_INPUT, DT);
    expect(sim.state.beacon.active).toBe(true);
    expect(bot.input().moveX).toBeLessThan(0); // nothing known: guard the beacon

    sim.emitSound('step', player.x + 150, player.y, rival.id);
    expect(bot.input().moveX).toBeGreaterThan(0);
  });

  it('carries enough cores to the beacon', () => {
    const { sim, bot, player } = setup([
      '##################',
      '#P.....C.......BP#',
      '##################',
    ]);
    player.cores = 2;
    sim.step(IDLE_INPUT, DT);
    expect(bot.input().moveX).toBeGreaterThan(0);
  });

  it('shocks a rival it has just located in reach and in sight, not a stale one', () => {
    const { sim, bot, player, rival } = setup();
    place(rival, player.x + 60, player.y);
    sim.emitSound('step', rival.x, rival.y, rival.id);
    expect(bot.input().shockwave).toBe(true);
    for (let i = 0; i < 60; i++) sim.step(IDLE_INPUT, DT);
    expect(bot.input().shockwave).toBe(false);
  });
});

describe('duel balance', () => {
  it('plays a real duel to a winner, the same way every time', () => {
    const round = playDuel(3);
    expect(round.winner).not.toBeNull();
    expect(round.firstCore).not.toBeNull();
    expect(round.seconds).toBeGreaterThan(3);
    expect(playDuel(3)).toEqual(round);
    // The same seed with another lag is still a full duel.
    expect(playDuel(3, 0).winner).not.toBeNull();
  });

  it('gives the same table twice', () => {
    expect(measureDuels(3)).toEqual(measureDuels(3));
  });

  it('sums rounds up', () => {
    const round = (r: Partial<DuelRound>): DuelRound => ({
      seed: 0,
      lag: 0,
      winner: 1,
      seconds: 10,
      leadChanges: 0,
      firstCore: 1,
      drops: 0,
      ...r,
    });
    const stats = summarize([
      round({ seconds: 10 }),
      round({ seconds: 30, winner: 2, leadChanges: 2, drops: 1 }),
      round({ seconds: 20, winner: 2, firstCore: 2 }),
      round({ seconds: 300, winner: null, leadChanges: 2 }),
    ]);
    expect(stats).toEqual({
      rounds: 4,
      hostWin: 1 / 3,
      medianSeconds: 20,
      p90Seconds: 30,
      meanLeadChanges: 1,
      firstCoreWins: 2 / 3,
      meanDrops: 0.25,
      timeouts: 1,
    });
    const table = formatDuelTable(stats);
    expect(table).toContain('| Host wins | 33% |');
    expect(table).toContain('| Past 5 min | 25% |');
  });

  it('is asked for with --duel', () => {
    expect(parseArgs(['--duel', '--maps', '5'])).toMatchObject({ duel: true, maps: 5 });
    expect(parseArgs([]).duel).toBe(false);
  });
});
