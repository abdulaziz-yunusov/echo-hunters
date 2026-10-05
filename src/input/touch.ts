import type { Action } from '@/config/input';
import { TOUCH, type TouchButtonDef, type TouchMode } from '@/config/touch';

/** A button where it sits on this screen. */
export interface PlacedButton extends TouchButtonDef {
  x: number;
  y: number;
}

/** The joystick while a finger steers it: where it was put down, and the knob. */
export interface Stick {
  originX: number;
  originY: number;
  knobX: number;
  knobY: number;
}

/** What the touch device asks of the action state. */
export interface TouchSink {
  press(action: Action, inputId: string): void;
  release(action: Action, inputId: string): void;
  /** A tap in a menu: point there (like the mouse). */
  pointer(x: number, y: number): void;
}

/** The buttons for a mode on a screen this size (CSS px). */
export function placeButtons(width: number, height: number, mode: TouchMode): PlacedButton[] {
  return TOUCH.buttons
    .filter((b) => !b.modes || b.modes.includes(mode))
    .map((b) => ({
      ...b,
      x: width - b.right,
      y: b.id === 'pause' ? TOUCH.pauseTop : height - b.bottom,
    }));
}

/**
 * Touch controls (Phase 12), as plain logic: fingers in, actions and a
 * movement vector out, so it is tested without a browser.
 *
 * In play: a finger landing on the left part of the screen places a
 * floating joystick there and steers (a light push sneaks); a finger on a
 * button holds that button's action. In menus (no mode): a tap is a click
 * at that spot, like the mouse.
 */
export class TouchControls {
  private mode: TouchMode | null = null;
  private width = 0;
  private height = 0;
  private stickFinger: number | null = null;
  private stickState: Stick | null = null;
  /** Finger id → the button it holds. */
  private readonly held = new Map<number, string>();
  /** Fingers tapping in a menu (each holds 'click' until lifted). */
  private readonly tapping = new Set<number>();
  private readonly sink: TouchSink;

  constructor(sink: TouchSink) {
    this.sink = sink;
  }

  /** The scene's controls (null: a menu) and the screen size. Changing mode lets go of everything. */
  configure(mode: TouchMode | null, width: number, height: number): void {
    this.width = width;
    this.height = height;
    if (mode !== this.mode) {
      this.releaseAll();
      this.mode = mode;
    }
  }

  get currentMode(): TouchMode | null {
    return this.mode;
  }

  /** The joystick, while steering; null otherwise. */
  get stick(): Readonly<Stick> | null {
    return this.stickState;
  }

  /** Ids of the buttons held right now (for drawing them pressed). */
  get pressedButtons(): ReadonlySet<string> {
    return new Set(this.held.values());
  }

  /**
   * Movement from the joystick: a unit direction (or none inside the dead
   * zone), and whether the push is light enough to sneak.
   */
  get movement(): { x: number; y: number; sneak: boolean } | null {
    const s = this.stickState;
    if (!s) return null;
    const dx = s.knobX - s.originX;
    const dy = s.knobY - s.originY;
    const push = Math.hypot(dx, dy) / TOUCH.joystick.radius;
    if (push < TOUCH.joystick.deadzone) return { x: 0, y: 0, sneak: false };
    const d = Math.hypot(dx, dy);
    return { x: dx / d, y: dy / d, sneak: push < TOUCH.joystick.sneakBelow };
  }

  buttons(): PlacedButton[] {
    return this.mode ? placeButtons(this.width, this.height, this.mode) : [];
  }

  down(finger: number, x: number, y: number): void {
    if (!this.mode) {
      // A menu: tap = click here.
      this.sink.pointer(x, y);
      this.tapping.add(finger);
      this.sink.press('click', touchId(finger));
      return;
    }
    const button = this.buttonAt(x, y);
    if (button) {
      this.held.set(finger, button.id);
      this.sink.press(button.action, touchId(finger));
      return;
    }
    if (this.stickFinger === null && x < this.width * TOUCH.joystick.zoneWidth) {
      this.stickFinger = finger;
      this.stickState = { originX: x, originY: y, knobX: x, knobY: y };
    }
  }

  move(finger: number, x: number, y: number): void {
    // A finger dragging in a menu (or the map editor) moves the pointer, like a mouse.
    if (this.tapping.has(finger)) this.sink.pointer(x, y);
    if (finger !== this.stickFinger || !this.stickState) return;
    const s = this.stickState;
    const dx = x - s.originX;
    const dy = y - s.originY;
    const d = Math.hypot(dx, dy);
    const r = TOUCH.joystick.radius;
    // The knob stays within reach of where the finger went down.
    s.knobX = d > r ? s.originX + (dx / d) * r : x;
    s.knobY = d > r ? s.originY + (dy / d) * r : y;
  }

  up(finger: number): void {
    if (this.tapping.delete(finger)) this.sink.release('click', touchId(finger));
    if (finger === this.stickFinger) {
      this.stickFinger = null;
      this.stickState = null;
    }
    const id = this.held.get(finger);
    if (id !== undefined) {
      this.held.delete(finger);
      const button = TOUCH.buttons.find((b) => b.id === id);
      if (button) this.sink.release(button.action, touchId(finger));
    }
  }

  /** Lift every finger (focus lost, mode changed). */
  releaseAll(): void {
    for (const finger of [...this.held.keys(), ...this.tapping]) this.up(finger);
    this.stickFinger = null;
    this.stickState = null;
  }

  private buttonAt(x: number, y: number): PlacedButton | null {
    for (const b of this.buttons()) {
      if (Math.hypot(x - b.x, y - b.y) <= b.radius + TOUCH.slop) return b;
    }
    return null;
  }
}

function touchId(finger: number): string {
  return `Touch${finger}`;
}
