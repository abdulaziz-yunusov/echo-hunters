import { describe, expect, it } from 'vitest';
import { TOUCH } from '@/config/touch';
import { ActionState } from '@/input/actionState';
import { placeButtons, TouchControls } from '@/input/touch';

/** Touch controls wired to a real ActionState, as the InputManager does. */
function setup(mode: 'solo' | 'duel' | null = 'solo', width = 800, height = 400) {
  const state = new ActionState();
  let aim: { x: number; y: number } | null = null;
  const touch = new TouchControls({
    press: (a, id) => state.press(a, id),
    release: (a, id) => state.release(a, id),
    pointer: (x, y) => (aim = { x, y }),
  });
  touch.configure(mode, width, height);
  const button = (id: string) => touch.buttons().find((b) => b.id === id)!;
  return { state, touch, button, aim: () => aim };
}

describe('touch controls (Phase 12)', () => {
  it('in a menu, a tap is a click where the finger is', () => {
    const { state, touch, aim } = setup(null);
    touch.down(1, 120, 80);
    expect(aim()).toEqual({ x: 120, y: 80 });
    expect(state.wasPressed('click')).toBe(true);
    expect(state.wasPressed('shockwave')).toBe(false);
    touch.up(1);
    expect(state.isDown('click')).toBe(false);
  });

  it('a tap still held when the screen changes is let go, so the next tap counts', () => {
    const { state, touch } = setup(null);
    touch.down(1, 10, 10);
    state.endTick();
    touch.configure('solo', 800, 400); // the menu became the game
    expect(state.isDown('click')).toBe(false);
    touch.configure(null, 800, 400);
    touch.down(2, 10, 10);
    expect(state.wasPressed('click')).toBe(true);
  });

  it('a finger on the left places the joystick; a light push sneaks, a full one walks', () => {
    const { touch } = setup();
    const r = TOUCH.joystick.radius;
    touch.down(1, 100, 300);
    expect(touch.movement).toEqual({ x: 0, y: 0, sneak: false }); // dead zone
    touch.move(1, 100 + r * 0.4, 300);
    expect(touch.movement).toEqual({ x: 1, y: 0, sneak: true });
    touch.move(1, 100, 300 - r * 0.9);
    expect(touch.movement).toMatchObject({ x: 0, y: -1, sneak: false });
    touch.move(1, 100, 300 + r * 5); // far: the knob stays within reach
    expect(touch.stick!.knobY).toBe(300 + r);
    touch.up(1);
    expect(touch.movement).toBeNull();
  });

  it('only one finger steers, and the right side never does', () => {
    const { touch } = setup();
    touch.down(1, 100, 300);
    touch.down(2, 150, 250);
    touch.move(2, 400, 250);
    expect(touch.movement).toEqual({ x: 0, y: 0, sneak: false });
    touch.up(1);
    touch.down(3, 700, 100); // right side, not on a button
    expect(touch.stick).toBeNull();
  });

  it('buttons hold their action while pressed: PING (hold = beam), STONE, SHOCK, pause', () => {
    const { state, touch, button } = setup();
    const ping = button('ping');
    touch.down(5, ping.x, ping.y);
    expect(state.wasPressed('ping')).toBe(true);
    expect(state.isDown('ping')).toBe(true); // held: the beam charges
    expect(touch.pressedButtons.has('ping')).toBe(true);
    touch.up(5);
    expect(state.isDown('ping')).toBe(false);

    for (const [id, action] of [
      ['stone', 'throwStone'],
      ['shock', 'shockwave'],
      ['pause', 'pause'],
    ] as const) {
      const b = button(id);
      touch.down(6, b.x + TOUCH.slop / 2, b.y); // a little off still counts
      expect(state.wasPressed(action), id).toBe(true);
      touch.up(6);
    }
  });

  it('steering and pressing work at the same time', () => {
    const { state, touch, button } = setup();
    touch.down(1, 100, 300);
    touch.move(1, 160, 300);
    const shock = button('shock');
    touch.down(2, shock.x, shock.y);
    expect(touch.movement!.x).toBe(1);
    expect(state.wasPressed('shockwave')).toBe(true);
  });

  it('the TOOL button is there only in duels', () => {
    expect(
      setup('solo')
        .touch.buttons()
        .some((b) => b.id === 'tool'),
    ).toBe(false);
    expect(
      setup('duel')
        .touch.buttons()
        .some((b) => b.id === 'tool'),
    ).toBe(true);
  });

  it('on a phone either way up, buttons fit on screen and never overlap', () => {
    for (const [w, h] of [
      [360, 640],
      [640, 360],
      [915, 412],
    ]) {
      const buttons = placeButtons(w, h, 'duel');
      for (const b of buttons) {
        expect(b.x - b.radius, `${b.id} ${w}x${h}`).toBeGreaterThanOrEqual(0);
        expect(b.y - b.radius).toBeGreaterThanOrEqual(0);
        expect(b.x + b.radius).toBeLessThanOrEqual(w);
        expect(b.y + b.radius).toBeLessThanOrEqual(h);
        for (const o of buttons) {
          if (o === b) continue;
          expect(Math.hypot(o.x - b.x, o.y - b.y), `${b.id}/${o.id}`).toBeGreaterThan(
            o.radius + b.radius,
          );
        }
      }
    }
  });

  it('losing focus lets go of everything', () => {
    const { state, touch, button } = setup();
    touch.down(1, 100, 300);
    const ping = button('ping');
    touch.down(2, ping.x, ping.y);
    touch.releaseAll();
    expect(touch.stick).toBeNull();
    expect(state.isDown('ping')).toBe(false);
  });
});
