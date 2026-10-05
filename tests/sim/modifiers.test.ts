import { describe, expect, it } from 'vitest';
import { LEVELS } from '@/config/levels';
import { MODIFIER_IDS, MODIFIER_ROLL, MODIFIERS, type ModifierId } from '@/config/modifiers';
import { SOUND_KINDS } from '@/config/sounds';
import { levelModifier } from '@/sim/modifiers';
import { buildRules } from '@/sim/rules';
import { scoreRound, type RoundResult } from '@/sim/scoring';
import { createSimulation } from '@/sim/simulation';

describe('level modifiers (Phase 21)', () => {
  it('each one is data: a label, a line, rule effects and a reward above 1', () => {
    for (const id of MODIFIER_IDS) {
      const def = MODIFIERS[id];
      expect(def.label.length).toBeGreaterThan(0);
      expect(def.effects.length).toBeGreaterThan(0);
      expect(def.scoreMultiplier).toBeGreaterThan(1);
      // It changes exactly the rules it lists.
      const before = buildRules({ level: 6 });
      const after = buildRules({ level: 6, modifier: id });
      const changed = (Object.keys(before) as (keyof typeof before)[]).filter(
        (k) => before[k] !== after[k],
      );
      expect(changed.sort()).toEqual([...new Set(def.effects.map((e) => e.key))].sort());
    }
  });

  it('act only through the rules: the same level is otherwise identical', () => {
    const plain = createSimulation({ seed: 11, level: 6, modifier: null }).state;
    for (const modifier of MODIFIER_IDS) {
      const s = createSimulation({ seed: 11, level: 6, modifier }).state;
      expect(s.modifier).toBe(modifier);
      expect(s.rules).toEqual(buildRules({ level: 6, modifier }));
      expect(s.layout).toEqual(plain.layout);
      expect(s.hunters).toEqual(plain.hunters);
      expect(s.pickups).toEqual(plain.pickups);
      expect(s.emitters).toEqual(plain.emitters);
      expect(s.cores).toEqual(plain.cores);
    }
  });

  it('change what they say in play', () => {
    const ping = (modifier: ModifierId | null) => {
      const sim = createSimulation({ seed: 11, level: 6, modifier });
      const p = sim.state.player;
      sim.emitSound('ping', p.x, p.y, p.id);
      return { wave: sim.state.waves.at(-1)!, state: sim.state };
    };
    expect(ping('echoChamber').wave.maxRadius).toBe(SOUND_KINDS.ping.maxRadius * 2);
    expect(ping('heavyAir').wave.speed).toBeCloseTo(SOUND_KINDS.ping.speed * 0.6);
    expect(ping('blackout').state.rules.ghostAlpha).toBe(0);
    const low = ping('lowPower').state;
    const none = ping(null).state;
    expect(low.player.stones).toBe(none.player.stones + 2);
    expect(low.rules.pingCooldown).toBeCloseTo(none.rules.pingCooldown * 1.5);
  });

  it('are seeded: the same run always has the same ones; levels 1–4 have none', () => {
    for (let seed = 1; seed <= 20; seed++) {
      for (let level = 1; level <= 12; level++) {
        expect(levelModifier(seed, level)).toBe(levelModifier(seed, level));
        expect(createSimulation({ seed, level }).state.modifier).toBe(levelModifier(seed, level));
      }
      for (let level = 1; level <= LEVELS.length; level++) {
        expect(levelModifier(seed, level)).toBeNull();
      }
    }
  });

  it('come with roughly their chance, all of them, never the same twice in a row', () => {
    let rolled = 0;
    let modified = 0;
    const seen = new Set<ModifierId>();
    for (let seed = 1; seed <= 60; seed++) {
      let previous: ModifierId | null = null;
      for (let level = MODIFIER_ROLL.fromLevel; level <= 20; level++) {
        const m = levelModifier(seed, level);
        rolled++;
        if (m) {
          modified++;
          seen.add(m);
          expect(m).not.toBe(previous);
        }
        previous = m;
      }
    }
    expect(modified / rolled).toBeGreaterThan(MODIFIER_ROLL.chance - 0.1);
    expect(modified / rolled).toBeLessThan(MODIFIER_ROLL.chance + 0.1);
    expect([...seen].sort()).toEqual([...MODIFIER_IDS].sort());
  });

  it('pay: everything earned × the multiplier, as its own line', () => {
    const r: RoundResult = {
      coresCollected: 3,
      extracted: true,
      seconds: 60,
      pingsUsed: 2,
      huntersStunned: 1,
      closeCalls: 0,
      areaScale: 1,
      scoreMultiplier: 1,
    };
    const plain = scoreRound(r);
    const paid = scoreRound({ ...r, scoreMultiplier: 1.25 });
    expect(plain.modifier).toBe(0);
    expect(paid.modifier).toBe(Math.round(plain.total * 0.25));
    expect(paid.total).toBe(plain.total + paid.modifier);
    // Caught: core and stun points still get the reward.
    const caught = scoreRound({ ...r, extracted: false, scoreMultiplier: 1.4 });
    expect(caught.modifier).toBe(Math.round((caught.cores + caught.stuns) * 0.4));
  });
});
