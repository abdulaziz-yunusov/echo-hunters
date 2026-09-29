import { describe, expect, it } from 'vitest';
import { DEFAULT_BINDINGS, REMAPPABLE } from '@/config/input';
import { inputLabel, rebind, withOverrides } from '@/input/bindings';

describe('key bindings', () => {
  it('overrides replace only what the player changed', () => {
    const b = withOverrides({ ping: ['KeyF'] });
    expect(b.ping).toEqual(['KeyF']);
    expect(b.sneak).toEqual(DEFAULT_BINDINGS.sneak);
  });

  it('rebinding puts the new key first and keeps the alternates', () => {
    const b = withOverrides(rebind({}, 'moveUp', 'KeyI'));
    expect(b.moveUp).toEqual(['KeyI', 'ArrowUp']);
  });

  it('taking a key from another action swaps them', () => {
    // Space belongs to ping; give it to throwStone (whose key is Q).
    const b = withOverrides(rebind({}, 'throwStone', 'Space'));
    expect(b.throwStone[0]).toBe('Space');
    expect(b.ping).toEqual(['KeyQ']);
  });

  it('never leaves a gameplay action without a key, nor a key on two actions', () => {
    let overrides = {};
    const keys = ['KeyW', 'KeyS', 'Space', 'KeyQ', 'Mouse0', 'KeyA', 'ShiftLeft', 'KeyD'];
    REMAPPABLE.forEach((action, i) => {
      overrides = rebind(overrides, action, keys[(i * 3) % keys.length]);
    });
    const b = withOverrides(overrides);
    const owners = new Map<string, string>();
    for (const action of REMAPPABLE) {
      expect(b[action].length, action).toBeGreaterThan(0);
      for (const key of b[action]) {
        expect(owners.get(key), `${key} on ${owners.get(key)} and ${action}`).toBeUndefined();
        owners.set(key, action);
      }
    }
  });

  it('shows friendly names', () => {
    expect(inputLabel('KeyW')).toBe('W');
    expect(inputLabel('ArrowUp')).toBe('↑');
    expect(inputLabel('Mouse0')).toBe('MOUSE L');
    expect(inputLabel('Digit3')).toBe('3');
    expect(inputLabel('F4')).toBe('F4');
  });
});
