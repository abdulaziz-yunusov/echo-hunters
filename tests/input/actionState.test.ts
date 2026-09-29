import { describe, expect, it } from 'vitest';
import { ActionState } from '@/input/actionState';

describe('ActionState', () => {
  it('a press is visible until endTick, even if already released', () => {
    const s = new ActionState();
    s.press('ping', 'Space');
    s.release('ping', 'Space'); // tap shorter than a tick
    expect(s.wasPressed('ping')).toBe(true);
    expect(s.isDown('ping')).toBe(false);
    s.endTick();
    expect(s.wasPressed('ping')).toBe(false);
  });

  it('a press survives frames that run no tick', () => {
    const s = new ActionState();
    s.press('ping', 'Space');
    // No endTick() yet: a 240 Hz frame ran zero simulation ticks.
    expect(s.wasPressed('ping')).toBe(true);
  });

  it('key repeat does not create extra presses', () => {
    const s = new ActionState();
    s.press('ping', 'Space');
    s.endTick();
    s.press('ping', 'Space'); // OS key repeat
    expect(s.wasPressed('ping')).toBe(false);
    expect(s.isDown('ping')).toBe(true);
  });

  it('an action stays held while any of its inputs is held', () => {
    const s = new ActionState();
    s.press('moveUp', 'KeyW');
    s.press('moveUp', 'ArrowUp');
    s.release('moveUp', 'KeyW');
    expect(s.isDown('moveUp')).toBe(true);
    s.release('moveUp', 'ArrowUp');
    expect(s.isDown('moveUp')).toBe(false);
  });

  it('releaseAll() drops holds (focus lost)', () => {
    const s = new ActionState();
    s.press('sneak', 'ShiftLeft');
    s.releaseAll();
    expect(s.isDown('sneak')).toBe(false);
  });
});
