import { describe, expect, it } from 'vitest';
import { GAME } from '@/config/game';
import { HUNTER_TYPES } from '@/config/hunters';
import { ENDLESS, LEVELS } from '@/config/levels';
import { PICKUP_TYPES } from '@/config/pickups';
import { SOUND_KINDS } from '@/config/sounds';
import { THEME } from '@/config/theme';

// Guards against typos and bad values when tuning config by hand.
describe('config integrity', () => {
  it('every sound kind uses a theme color and positive numbers', () => {
    for (const [id, kind] of Object.entries(SOUND_KINDS)) {
      expect(THEME.colors, id).toHaveProperty(kind.color);
      expect(kind.maxRadius, id).toBeGreaterThan(0);
      expect(kind.speed, id).toBeGreaterThan(0);
      expect(kind.tags.length, id).toBeGreaterThan(0);
    }
  });

  it('every hunter hears at least one tag that some sound emits', () => {
    const emitted = new Set(Object.values(SOUND_KINDS).flatMap((k) => k.tags));
    for (const [id, hunter] of Object.entries(HUNTER_TYPES)) {
      expect(
        hunter.hears.some((tag) => emitted.has(tag)),
        id,
      ).toBe(true);
    }
  });

  it('levels only reference existing hunters and pickups', () => {
    const allLevels = [...LEVELS, { hunters: ENDLESS.hunterPool, pickups: ENDLESS.pickups }];
    for (const level of allLevels) {
      for (const h of level.hunters) expect(HUNTER_TYPES).toHaveProperty(h);
      for (const p of Object.keys(level.pickups)) expect(PICKUP_TYPES).toHaveProperty(p);
    }
  });

  it('endless scaling has sane caps', () => {
    const lastHandMade = LEVELS[LEVELS.length - 1]!;
    expect(ENDLESS.maxHunters).toBeGreaterThanOrEqual(lastHandMade.hunters.length);
    expect(ENDLESS.maxMapScale).toBeGreaterThanOrEqual(1);
  });

  it('player sneak is slower than walking', () => {
    expect(GAME.player.sneakSpeed).toBeLessThan(GAME.player.speed);
  });

  it('shockwave effect fits inside its sound ring', () => {
    expect(GAME.abilities.shockwave.effectRadius).toBeLessThanOrEqual(
      SOUND_KINDS.shockwave.maxRadius,
    );
  });
});
