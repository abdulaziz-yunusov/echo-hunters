import { describe, expect, it } from 'vitest';
import { GAME } from '@/config/game';
import { PICKUP_TYPES } from '@/config/pickups';
import { SOUND_KINDS } from '@/config/sounds';
import { UPGRADE_IDS, UPGRADE_OFFER_SIZE, UPGRADES, type UpgradeId } from '@/config/upgrades';
import { Rng } from '@/core/rng';
import { IDLE_INPUT, type PlayerInput } from '@/sim/playerInput';
import { buildRules } from '@/sim/rules';
import type { SimulationOptions } from '@/sim/simulation';
import { offerUpgrades, stacksOf } from '@/sim/upgrades';
import { chargedBeam } from '../helpers/beam';
import { simFromAscii, TS } from '../helpers/maps';

const DT = 1 / 60;
const ROOM = [
  '###############',
  '#.............#',
  '#.P.......H...#',
  '#.............#',
  '###############',
];

function setup(upgrades: UpgradeId[], options: SimulationOptions = {}, rows = ROOM) {
  const sim = simFromAscii(rows, { hunters: [], upgrades, ...options });
  const run = (input: Partial<PlayerInput>, ticks = 1) => {
    for (let i = 0; i < ticks; i++) sim.step({ ...IDLE_INPUT, ...input }, DT);
  };
  return { sim, run, player: sim.state.player };
}

describe('upgrade rules (Phase 20)', () => {
  it('every upgrade is data: a label, a line, a cap and rule effects', () => {
    for (const id of UPGRADE_IDS) {
      const def = UPGRADES[id];
      expect(def.label.length).toBeGreaterThan(0);
      expect(def.description.length).toBeLessThanOrEqual(48);
      expect(def.maxStacks).toBeGreaterThanOrEqual(1);
      expect(def.effects.length).toBeGreaterThan(0);
      // One stack changes something, and only the rules it lists.
      const before = buildRules();
      const after = buildRules({ upgrades: [id] });
      const changed = (Object.keys(before) as (keyof typeof before)[]).filter(
        (k) => before[k] !== after[k],
      );
      expect(changed.sort()).toEqual([...new Set(def.effects.map((e) => e.key))].sort());
    }
  });

  it('stacks multiply or add once per stack, after the level’s own overrides', () => {
    const base = buildRules();
    expect(buildRules({ upgrades: ['quickPing', 'quickPing'] }).pingCooldown).toBeCloseTo(
      base.pingCooldown * 0.85 ** 2,
    );
    expect(buildRules({ level: 4, upgrades: ['quickPing'] }).pingCooldown).toBeCloseTo(3 * 0.85);
    expect(buildRules({ upgrades: ['stoneBelt', 'stoneBelt', 'stoneBelt'] }).startStones).toBe(
      base.startStones + 3,
    );
    // Past the cap, nothing more.
    expect(buildRules({ upgrades: Array<UpgradeId>(5).fill('stoneBelt') }).startStones).toBe(
      base.startStones + UPGRADES.stoneBelt.maxStacks,
    );
    expect(buildRules({ upgrades: ['thickSkin', 'wideBeam'] })).toMatchObject({
      maxHp: base.maxHp + 1,
      beamArc: base.beamArc + 10,
    });
  });
});

describe('offers', () => {
  it('are seeded: the same run, level and picks give the same cards', () => {
    expect(offerUpgrades(42, 3, ['quickPing'])).toEqual(offerUpgrades(42, 3, ['quickPing']));
    const offers = offerUpgrades(42, 3, []);
    expect(offers).toHaveLength(UPGRADE_OFFER_SIZE);
    expect(new Set(offers).size).toBe(offers.length);
    // Different levels and seeds give different cards (most of the time).
    const seen = new Set<string>();
    for (let level = 2; level <= 9; level++) seen.add(offerUpgrades(42, level, []).join());
    for (let seed = 1; seed <= 8; seed++) seen.add(offerUpgrades(seed, 2, []).join());
    expect(seen.size).toBeGreaterThan(12);
  });

  it('never offer an upgrade at its cap; fewer cards when few are left; none when all are', () => {
    const maxed = (id: UpgradeId) => Array<UpgradeId>(UPGRADES[id].maxStacks).fill(id);
    for (let level = 2; level < 30; level++) {
      expect(offerUpgrades(7, level, maxed('quickPing'))).not.toContain('quickPing');
    }
    const allBut = (keep: UpgradeId[]) =>
      UPGRADE_IDS.filter((id) => !keep.includes(id)).flatMap(maxed);
    expect(offerUpgrades(7, 2, allBut(['lightFeet', 'quickBeam'])).sort()).toEqual([
      'lightFeet',
      'quickBeam',
    ]);
    expect(offerUpgrades(7, 2, allBut([]))).toEqual([]);
  });

  it('a run to level 8 can end with many different builds', () => {
    const builds = new Set<string>();
    for (let seed = 1; seed <= 30; seed++) {
      const pickRng = new Rng(seed * 31);
      const owned: UpgradeId[] = [];
      for (let level = 2; level <= 8; level++) {
        const offers = offerUpgrades(seed, level, owned);
        owned.push(offers[pickRng.int(0, offers.length - 1)]);
      }
      for (const id of UPGRADE_IDS) {
        expect(stacksOf(owned, id)).toBeLessThanOrEqual(UPGRADES[id].maxStacks);
      }
      builds.add([...owned].sort().join());
    }
    expect(builds.size).toBe(30);
  });
});

describe('each upgrade in play', () => {
  it('THICK SKIN: more HP (one stack only: a second does nothing)', () => {
    const { player } = setup(['thickSkin', 'thickSkin']);
    expect(player).toMatchObject({ hp: GAME.player.hp + 1, maxHp: GAME.player.hp + 1 });
  });

  it('STONE BELT: more stones at the start', () => {
    expect(setup(['stoneBelt']).player.stones).toBe(GAME.player.startStones + 1);
  });

  it('QUICK PING and QUICK BEAM: shorter cooldowns', () => {
    const ping = setup(['quickPing']);
    ping.run({ ping: true });
    ping.run({});
    expect(ping.player.pingCooldown).toBeCloseTo(GAME.abilities.ping.cooldown * 0.85 - DT, 5);
    const beam = setup(['quickBeam']);
    for (const input of chargedBeam({ x: 400, y: 80 })) beam.run(input);
    expect(beam.player.beamCooldown).toBeGreaterThan(GAME.abilities.beam.cooldown * 0.8 - 0.1);
    expect(beam.player.beamCooldown).toBeLessThanOrEqual(GAME.abilities.beam.cooldown * 0.8);
  });

  it('WIDE BEAM: a wider wedge', () => {
    const { sim, run } = setup(['wideBeam']);
    for (const input of chargedBeam({ x: 400, y: 80 })) run(input);
    const beam = sim.state.waves.find((w) => w.kind === 'pingBeam')!;
    expect((beam.arc!.halfAngle * 360) / Math.PI).toBeCloseTo(SOUND_KINDS.pingBeam.arc + 10);
  });

  it('WIDE SHOCK: stuns a hunter just beyond the normal reach; QUICK SHOCK: sooner again', () => {
    // The hunter (H) is 4.5 tiles (144 px) away: beyond 120 + its radius, within 150.
    const rows = [
      '###############',
      '#.............#',
      '#.P....H......#',
      '#.............#',
      '###############',
    ];
    const near = (upgrades: UpgradeId[]) => {
      const t = setup(upgrades, { hunters: ['stalker'] }, rows);
      t.sim.state.hunters[0].x -= TS / 2;
      t.run({ shockwave: true });
      return t;
    };
    expect(near([]).sim.state.hunters[0].state).not.toBe('stunned');
    const wide = near(['wideShock', 'quickShock']);
    expect(wide.sim.state.hunters[0].state).toBe('stunned');
    expect(wide.player.shockCooldown).toBeCloseTo(GAME.abilities.shockwave.cooldown * 0.8, 5);
  });

  it('SOFT SOLES: a step heard from 79 px away is not heard any more', () => {
    // The first step falls 49 px right of the start; the Stalker stands 79 px beyond it.
    const rows = ['###########', '#P...H....#', '###########'];
    const heard = (upgrades: UpgradeId[]) => {
      const t = setup(upgrades, { hunters: ['stalker'] }, rows);
      let n = 0;
      t.sim.events.on('hunterHeard', () => n++);
      t.run({ moveX: 1 }, 22); // one step
      t.run({}, 30);
      return n;
    };
    expect(heard([])).toBe(1);
    expect(heard(['softSoles'])).toBe(0);
  });

  it('LIGHT FEET: faster sneaking; LONG BOOTS: longer silence', () => {
    const feet = setup(['lightFeet']);
    feet.run({ moveX: 1, sneak: true }, 60);
    expect(feet.player.x - feet.player.prevX).toBeCloseTo((GAME.player.sneakSpeed * 1.15) / 60);
    const boots = setup(['longBoots'], { pickups: {} });
    boots.sim.state.pickups.push({
      id: 1,
      type: 'silentBoots',
      x: boots.player.x + 20,
      y: boots.player.y,
      collected: false,
    });
    boots.run({ moveX: 1 }, 10);
    expect(boots.player.silentTime).toBeGreaterThan(PICKUP_TYPES.silentBoots.duration + 3.5);
  });
});
