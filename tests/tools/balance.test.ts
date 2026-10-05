import { describe, expect, it } from 'vitest';
import { Bot } from '@/bot/bot';
import { UPGRADE_IDS } from '@/config/upgrades';
import { MODIFIER_IDS } from '@/config/modifiers';
import {
  formatModifierTable,
  formatTable,
  formatUpgradeTable,
  measureLevel,
  measureModifiers,
  measureUpgrades,
  parseArgs,
  parseLevels,
  playRound,
} from '../../tools/balance/balance';
import { simFromAscii } from '../helpers/maps';

describe('balance bot', () => {
  it('extracts from a real level 1 map when nothing hunts it', () => {
    const outcome = playRound(1, 1, 'basic', []);
    expect(outcome).toMatchObject({ extracted: true, hits: 0, timedOut: false });
    expect(outcome.seconds).toBeGreaterThan(5);
  });

  it('is deterministic: the same round twice gives the same outcome', () => {
    for (const profile of ['basic', 'careful'] as const) {
      expect(playRound(5, 3, profile)).toEqual(playRound(5, 3, profile));
    }
  });

  it('basic pings on a timer and never sneaks or uses tools', () => {
    const sim = simFromAscii(['#########', '#P..H..C#', '#########'], { hunters: ['stalker'] });
    const input = new Bot(sim, 'basic').input();
    expect(input.ping).toBe(true);
    expect(input.sneak || input.shockwave || input.throwStone).toBe(false);
  });

  it('careful shocks a hunter in reach and stays quiet near it', () => {
    const sim = simFromAscii(['#########', '#P..H..C#', '#########'], { hunters: ['stalker'] });
    const input = new Bot(sim, 'careful').input();
    expect(input.shockwave).toBe(true);
    expect(input.sneak).toBe(true);
    expect(input.ping).toBe(false);
  });

  it('careful throws a decoy at a hunter coming for it, out of shockwave reach', () => {
    const sim = simFromAscii(['###############', '#P.......H...C#', '###############'], {
      hunters: ['stalker'],
    });
    sim.state.hunters[0].state = 'investigate';
    const input = new Bot(sim, 'careful').input();
    expect(input.shockwave).toBe(false);
    expect(input.throwStone).toBe(true);
    expect(input.aim).not.toBeNull();
  });

  it('measures a level into success, time and hits', () => {
    const stats = measureLevel(1, { levels: [1], maps: 2, profile: 'basic', hunters: [] });
    expect(stats).toMatchObject({ level: 1, rounds: 2, success: 1, meanHits: 0, timeouts: 0 });
    const table = formatTable([stats], 'Level');
    expect(table.split('\n')).toHaveLength(5);
    expect(table).toContain('| Success | 100% |');
  });
});

describe('balance command line', () => {
  it('reads level lists and ranges', () => {
    expect(parseLevels('1-3,6')).toEqual([1, 2, 3, 6]);
    expect(() => parseLevels('0')).toThrow();
    expect(() => parseLevels('5-2')).toThrow();
  });

  it('has defaults and rejects unknown input', () => {
    expect(parseArgs([])).toMatchObject({ maps: 40, profiles: ['basic'] });
    expect(parseArgs(['--profile', 'all', '--hunters', 'stalker,sprinter'])).toMatchObject({
      profiles: ['basic', 'careful'],
      hunters: ['stalker', 'sprinter'],
    });
    expect(() => parseArgs(['--profile', 'reckless'])).toThrow();
    expect(() => parseArgs(['--hunters', 'ghost'])).toThrow();
    expect(() => parseArgs(['--wat', '1'])).toThrow();
    expect(() => parseArgs(['--maps'])).toThrow();
  });

  it('takes upgrades (Phase 20) and the upgrade table', () => {
    expect(parseArgs(['--upgrades', 'quickPing,quickPing'])).toMatchObject({
      upgrades: ['quickPing', 'quickPing'],
      upgradeTable: false,
    });
    expect(parseArgs(['--upgrade-table', '--levels', '4-8'])).toMatchObject({
      upgradeTable: true,
      levels: [4, 5, 6, 7, 8],
    });
    expect(() => parseArgs(['--upgrades', 'jetpack'])).toThrow();
  });

  it('takes a forced modifier (Phase 21) and the modifier table', () => {
    expect(parseArgs(['--modifier', 'blackout']).modifier).toBe('blackout');
    expect(parseArgs(['--modifier', 'none']).modifier).toBeNull();
    expect(parseArgs([]).modifier).toBeUndefined();
    expect(parseArgs(['--modifier-table']).modifierTable).toBe(true);
    expect(() => parseArgs(['--modifier', 'fog'])).toThrow();
    const rows = measureModifiers([5], 1, 'basic');
    expect(rows.map((r) => r.modifier)).toEqual([null, ...MODIFIER_IDS]);
    expect(formatModifierTable(rows)).toContain('ECHO CHAMBER');
  });

  it('the upgrade table lists every upgrade against none', () => {
    const stats = measureUpgrades([1], 1, 'basic');
    expect(stats.map((s) => s.upgrade)).toEqual([null, ...UPGRADE_IDS]);
    const table = formatUpgradeTable(stats);
    expect(table.split('\n')).toHaveLength(UPGRADE_IDS.length + 3);
    expect(table).toContain('THICK SKIN');
  });
});
