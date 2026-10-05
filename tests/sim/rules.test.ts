import { describe, expect, it } from 'vitest';
import { DUEL_VARIANT_ORDER, DUEL_VARIANTS } from '@/config/duel';
import { GAME } from '@/config/game';
import { SOUND_KINDS } from '@/config/sounds';
import { setHunterState } from '@/sim/ai/hunterBrain';
import { IDLE_INPUT } from '@/sim/playerInput';
import { applyEffects, buildRules, pickVariant } from '@/sim/rules';
import { createDuelSimulation } from '@/sim/simulation';
import { simFromAscii } from '../helpers/maps';

const DT = 1 / 60;

describe('rules pipeline (Phase 30)', () => {
  it('defaults come from GAME, and a level overrides its own', () => {
    expect(buildRules()).toEqual({
      pingCooldown: GAME.abilities.ping.cooldown,
      soundRings: 1,
      soundHearing: 1,
      soundSpeed: 1,
      coreHumInterval: GAME.objectives.coreHumInterval,
      ghostAlpha: null,
    });
    expect(buildRules({ level: 4 }).pingCooldown).toBe(3); // GDD level 4
    expect(buildRules({ variant: 'classic' })).toEqual(buildRules());
  });

  it('effects are data: multiply or set, in order', () => {
    const rules = applyEffects(buildRules(), [
      { key: 'soundSpeed', mul: 0.5 },
      { key: 'soundSpeed', mul: 0.5 },
      { key: 'ghostAlpha', set: 0 },
    ]);
    expect(rules.soundSpeed).toBe(0.25);
    expect(rules.ghostAlpha).toBe(0);
  });

  it('each variant changes exactly the rules it lists', () => {
    expect(buildRules({ variant: 'blackout' })).toEqual({ ...buildRules(), ghostAlpha: 0 });
    expect(buildRules({ variant: 'heavyAir' })).toEqual({ ...buildRules(), soundSpeed: 0.6 });
    expect(buildRules({ variant: 'echoChamber' })).toEqual({
      ...buildRules(),
      soundRings: 1.5,
      soundHearing: 1.5,
    });
    for (const v of ['coreRush', 'hunted'] as const)
      expect(buildRules({ variant: v })).toEqual(buildRules());
  });
});

describe('arena variants act only through rules and map settings', () => {
  it('Heavy Air: slow rings, heard later; Echo Chamber: bigger rings', () => {
    const wave = (variant: 'classic' | 'heavyAir' | 'echoChamber') => {
      const sim = createDuelSimulation({ seed: 5, role: 'host', variant, hunters: [] });
      const { player } = sim.state;
      sim.emitSound('ping', player.x, player.y, player.id);
      return sim.state.waves.at(-1)!;
    };
    expect(wave('heavyAir').speed).toBeCloseTo(SOUND_KINDS.ping.speed * 0.6);
    expect(wave('heavyAir').maxRadius).toBe(SOUND_KINDS.ping.maxRadius);
    expect(wave('echoChamber').maxRadius).toBeCloseTo(SOUND_KINDS.ping.maxRadius * 1.5);
    expect(wave('classic').speed).toBe(SOUND_KINDS.ping.speed);
  });

  it('Echo Chamber: hunters hear 1.5× further; Heavy Air: they hear later', () => {
    const heardAt = (variant: 'classic' | 'heavyAir' | 'echoChamber', tiles: number) => {
      const rows = [
        '#'.repeat(24),
        `#P${'.'.repeat(tiles - 1)}H${'.'.repeat(20 - tiles)}#`,
        '#'.repeat(24),
      ];
      const sim = simFromAscii(rows, { mode: 'host', hunters: ['stalker'], variant });
      setHunterState(sim, sim.state.hunters[0], 'stunned');
      let at: number | null = null;
      sim.events.on('hunterHeard', () => (at ??= sim.state.time));
      const { player } = sim.state;
      sim.emitSound('step', player.x, player.y, player.id);
      for (let i = 0; i < 180; i++) sim.step(IDLE_INPUT, DT);
      return at;
    };
    // A step carries 90 px: 128 px is out of reach, unless the chamber carries it.
    expect(heardAt('classic', 4)).toBeNull();
    expect(heardAt('echoChamber', 4)).not.toBeNull();
    const normal = heardAt('classic', 2)!;
    const slow = heardAt('heavyAir', 2)!;
    expect(slow).toBeGreaterThan(normal);
  });

  it('Core Rush: 5 cores, carry 3; Hunted: two Stalkers; both sides get the same', () => {
    for (const role of ['host', 'client'] as const) {
      const rush = createDuelSimulation({ seed: 8, role, variant: 'coreRush' }).state;
      expect(rush.cores).toHaveLength(5);
      expect(rush.duel!.coresToWin).toBe(3);
      const hunted = createDuelSimulation({ seed: 8, role, variant: 'hunted' }).state;
      expect(hunted.hunters.map((h) => h.type)).toEqual(['stalker', 'stalker']);
    }
    const a = createDuelSimulation({ seed: 8, role: 'host', variant: 'coreRush' }).state;
    const b = createDuelSimulation({ seed: 8, role: 'client', variant: 'coreRush' }).state;
    expect(b.cores.map((c) => [c.x, c.y])).toEqual(a.cores.map((c) => [c.x, c.y]));
    expect(b.layout.seed).toBe(a.layout.seed);
  });

  it('every variant builds a valid map on many seeds', () => {
    for (const variant of DUEL_VARIANT_ORDER) {
      for (let seed = 1; seed <= 25; seed++) {
        const s = createDuelSimulation({ seed, role: 'host', variant }).state;
        const want = (DUEL_VARIANTS[variant].map as { cores?: number }).cores ?? 3;
        expect(s.cores, `${variant} seed ${seed}`).toHaveLength(want);
      }
    }
  });
});

describe('picking a variant', () => {
  it('a fixed choice is itself; RANDOM comes from the seed, never the same twice in a row', () => {
    expect(pickVariant('hunted', 1)).toBe('hunted');
    const seen = new Set<string>();
    for (let seed = 1; seed <= 200; seed++) {
      const v = pickVariant('random', seed);
      expect(pickVariant('random', seed)).toBe(v);
      seen.add(v);
      for (const previous of DUEL_VARIANT_ORDER) {
        expect(pickVariant('random', seed, previous)).not.toBe(previous);
      }
    }
    expect([...seen].sort()).toEqual([...DUEL_VARIANT_ORDER].sort());
  });
});
