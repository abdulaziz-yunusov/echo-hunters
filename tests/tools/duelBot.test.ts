import { describe, expect, it } from 'vitest';
import { AUDIO_SOUNDS } from '@/config/audio';
import { DUEL_BOTS, DUEL_BOT_ORDER, type DuelBotId } from '@/config/duelBots';
import { GAME } from '@/config/game';
import type { Player } from '@/sim/entities/player';
import { IDLE_INPUT, type PlayerInput } from '@/sim/playerInput';
import {
  formatDuelTable,
  measureDuels,
  playDuel,
  summarize,
  type DuelRound,
} from '../../tools/balance/duelBalance';
import { parseArgs } from '../../tools/balance/balance';
import { DuelBot } from '@/bot/duelBot';
import { simFromAscii } from '../helpers/maps';

const DT = 1 / 60;

/** A long corridor: the bot (host) at the left P, the rival at the right one, 768 px apart. */
const CORRIDOR = [
  '###########################',
  '#P.......................P#',
  '###########################',
];

function setup(rows = CORRIDOR, level: DuelBotId = 'hard', seed = 0) {
  const sim = simFromAscii(rows, { mode: 'host', hunters: [] });
  const bot = new DuelBot(sim, { level, seed });
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

describe('duel bot levels', () => {
  it('hears the rival only within its share of the earshot', () => {
    const range = AUDIO_SOUNDS.step.range;
    for (const level of DUEL_BOT_ORDER) {
      const { sim, bot, player, rival } = setup(CORRIDOR, level);
      const edge = range * DUEL_BOTS[level].hearing;
      sim.emitSound('step', player.x + edge + 5, player.y, rival.id);
      for (let i = 0; i < 120; i++) sim.step(IDLE_INPUT, DT);
      bot.input();
      expect(bot.lastKnownRival, level).toBeNull();
      sim.emitSound('step', player.x + edge - 5, player.y, rival.id);
      for (let i = 0; i < 120; i++) sim.step(IDLE_INPUT, DT);
      bot.input();
      expect(bot.lastKnownRival, level).toMatchObject({ x: player.x + edge - 5 });
    }
  });

  it('acts on what it heard only after its reaction delay', () => {
    const { sim, bot, player, rival } = setup(CORRIDOR, 'easy');
    sim.emitSound('step', player.x + 50, player.y, rival.id);
    const delay = DUEL_BOTS.easy.reactionDelay;
    let knownAt = -1;
    for (let i = 0; i < 200 && knownAt < 0; i++) {
      bot.input();
      if (bot.lastKnownRival) knownAt = sim.state.time;
      sim.step(IDLE_INPUT, DT);
    }
    expect(knownAt).toBeGreaterThanOrEqual(delay - DT);
    expect(knownAt).toBeLessThan(delay + 2 * DT);
  });

  it('waits its reaction delay before going for a new goal, then walks at its pace', () => {
    const rows = [
      '##################',
      '#P.......C.......#',
      '#...............P#',
      '##################',
    ];
    for (const level of DUEL_BOT_ORDER) {
      const { sim, bot } = setup(rows, level);
      const { reactionDelay, pace } = DUEL_BOTS[level];
      const moves: PlayerInput[] = [];
      for (let t = 0; t < reactionDelay + 0.5; t += DT) {
        moves.push(bot.input());
        sim.step(IDLE_INPUT, DT);
      }
      const still = Math.round(reactionDelay / DT);
      expect(
        moves.slice(0, still).every((m) => m.moveX === 0 && m.moveY === 0),
        level,
      ).toBe(true);
      const walking = moves[moves.length - 1];
      expect(Math.hypot(walking.moveX, walking.moveY), level).toBeCloseTo(pace, 5);
    }
  });

  it('throws decoy stones at hunters only with tools', () => {
    const rows = [
      '###################',
      '#P......H...C.....#',
      '#................P#',
      '###################',
    ];
    const throws = (level: DuelBotId) => {
      const sim = simFromAscii(rows, { mode: 'host', hunters: ['stalker'] });
      const bot = new DuelBot(sim, { level });
      sim.state.hunters[0].state = 'investigate';
      return bot.input().throwStone;
    };
    expect(throws('hard')).toBe(true);
    expect(throws('normal')).toBe(true);
    expect(throws('easy')).toBe(false);
  });

  it('a shaky hand sometimes fires too early; a sure one waits for reach', () => {
    const early = (level: DuelBotId, seed: number) => {
      const { sim, bot, player, rival } = setup(CORRIDOR, level, seed);
      place(rival, player.x + GAME.abilities.shockwave.effectRadius * 1.5, player.y);
      sim.emitSound('stepMetal', rival.x, rival.y, rival.id);
      for (let i = 0; i < 100; i++) sim.step(IDLE_INPUT, DT); // past the easy bot's delay
      const first = bot.input().shockwave;
      // One decision per sighting: it doesn't roll again for the same one.
      const second = bot.input().shockwave;
      expect(first && second).toBe(false);
      return first || second ? 1 : 0;
    };
    const seeds = Array.from({ length: 40 }, (_, i) => i + 1);
    expect(seeds.reduce((n, s) => n + early('hard', s), 0)).toBe(0);
    const easy = seeds.reduce((n, s) => n + early('easy', s), 0);
    expect(easy).toBeGreaterThan(10); // fires early 70% of the time
    expect(easy).toBeLessThan(40);
  });

  it('reads no rival position it could not hear or see, at every level', () => {
    // The bot walks and pings for 10 s. The rival is far away, out of
    // earshot and beyond every ring, and walks about making noise. Wherever
    // it is, the bot must play exactly the same.
    const rows = [
      '#'.repeat(60),
      '#P......C.....C' + '.'.repeat(44) + '#',
      '#' + '.'.repeat(57) + 'P#',
      '#'.repeat(60),
    ];
    const play = (level: DuelBotId, rivalX: number) => {
      const { sim, bot, rival } = setup(rows, level, 7);
      const inputs: PlayerInput[] = [];
      for (let i = 0; i < 600; i++) {
        place(rival, rivalX + 40 * Math.sin(i / 50), rival.y);
        if (i % 20 === 0) sim.emitSound('step', rival.x, rival.y, rival.id);
        const input = bot.input();
        inputs.push(input);
        sim.step(input, DT);
      }
      return { inputs, known: bot.lastKnownRival };
    };
    for (const level of DUEL_BOT_ORDER) {
      const a = play(level, 1500);
      const b = play(level, 1750);
      expect(a.known, level).toBeNull();
      expect(b.inputs, level).toEqual(a.inputs);
      // Control: the same rival within earshot is noticed.
      expect(play(level, 200).known, level).not.toBeNull();
    }
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
      bots: ['hard', 'hard'],
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
      bots: ['hard', 'hard'],
      firstBotWin: 1, // the same level both sides
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
    expect(table).not.toContain('beats');
  });

  it('compares two levels, each hosting half the rounds', () => {
    const round = (bots: DuelRound['bots'], winner: number): DuelRound => ({
      seed: 0,
      bots,
      lag: 0,
      winner,
      seconds: 10,
      leadChanges: 0,
      firstCore: 1,
      drops: 0,
    });
    const stats = summarize(
      [round(['hard', 'easy'], 1), round(['easy', 'hard'], 2), round(['easy', 'hard'], 1)],
      ['hard', 'easy'],
    );
    expect(stats.firstBotWin).toBeCloseTo(2 / 3);
    expect(formatDuelTable(stats)).toContain('| HARD beats EASY | 67% |');
    expect(measureDuels(2, ['hard', 'easy']).bots).toEqual(['hard', 'easy']);
    expect(playDuel(1, 0, ['hard', 'easy']).bots).toEqual(['hard', 'easy']);
  });

  it('is asked for with --duel', () => {
    expect(parseArgs(['--duel', '--maps', '5'])).toMatchObject({ duel: true, maps: 5 });
    expect(parseArgs([]).duel).toBe(false);
    expect(parseArgs(['--duel', '--bots', 'hard,easy']).bots).toEqual(['hard', 'easy']);
    expect(parseArgs([]).bots).toEqual(['hard', 'hard']);
    expect(() => parseArgs(['--bots', 'hard'])).toThrow();
    expect(() => parseArgs(['--bots', 'hard,genius'])).toThrow();
  });
});
