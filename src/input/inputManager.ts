import { DEFAULT_BINDINGS, type Action } from '@/config/input';
import { ActionState } from './actionState';
import type { Bindings } from './bindings';
import type { InputFrame } from './inputFrame';
import { attachKeyboardMouse } from './keyboardMouse';
import { TouchControls } from './touch';
import type { TouchMode } from '@/config/touch';

/**
 * Owns all input devices and turns them into one InputFrame per simulation
 * tick: keyboard, mouse, and (Phase 12) touch controls.
 */
export class InputManager {
  private readonly state = new ActionState();
  private readonly byInput = new Map<string, Action[]>();
  private aim: { x: number; y: number } | null = null;
  /** Set while waiting for a key to rebind: the next input goes here, not to actions. */
  private capture: ((inputId: string) => void) | null = null;
  private readonly detach: () => void;
  /** On-screen controls (Phase 12). */
  readonly touch: TouchControls;
  /** The last input came from a finger: show the on-screen controls, aim by facing. */
  private touching = false;

  constructor(canvas: HTMLCanvasElement, bindings: Bindings = DEFAULT_BINDINGS) {
    this.setBindings(bindings);
    this.touch = new TouchControls({
      press: (action, id) => this.state.press(action, id),
      release: (action, id) => this.state.release(action, id),
      pointer: (x, y) => (this.aim = { x, y }),
    });
    this.detach = attachKeyboardMouse(canvas, {
      down: (id) => {
        this.touching = false;
        return this.inputDown(id);
      },
      up: (id) => this.inputUp(id),
      pointer: (x, y) => {
        this.touching = false;
        this.aim = { x, y };
      },
      touchDown: (finger, x, y) => {
        this.touching = true;
        this.touch.down(finger, x, y);
      },
      touchMove: (finger, x, y) => this.touch.move(finger, x, y),
      touchUp: (finger) => this.touch.up(finger),
      lost: () => {
        this.touch.releaseAll();
        this.state.releaseAll();
      },
    });
  }

  /** The player is using a touch screen right now. */
  get usingTouch(): boolean {
    return this.touching;
  }

  /** Which on-screen controls the current scene wants (null: it's a menu), and the screen size. */
  setTouchMode(mode: TouchMode | null, width: number, height: number): void {
    this.touch.configure(mode, width, height);
  }

  /**
   * Hand the next key or mouse button pressed to `callback` instead of the
   * game (for rebinding controls). Replaces any capture already waiting.
   */
  captureNextInput(callback: (inputId: string) => void): void {
    this.capture = callback;
  }

  cancelCapture(): void {
    this.capture = null;
  }

  /** Replace key bindings (settings / remapping). */
  setBindings(bindings: Bindings): void {
    this.byInput.clear();
    for (const [action, inputs] of Object.entries(bindings) as [Action, readonly string[]][]) {
      for (const id of inputs) {
        const list = this.byInput.get(id) ?? [];
        list.push(action);
        this.byInput.set(id, list);
      }
    }
    this.state.releaseAll();
  }

  /** Build the input for one simulation tick, then clear one-tick presses. */
  sample(): InputFrame {
    const s = this.state;
    let moveX = (s.isDown('moveRight') ? 1 : 0) - (s.isDown('moveLeft') ? 1 : 0);
    let moveY = (s.isDown('moveDown') ? 1 : 0) - (s.isDown('moveUp') ? 1 : 0);
    const length = Math.hypot(moveX, moveY);
    if (length > 1) {
      // Diagonals must not be faster than straight lines.
      moveX /= length;
      moveY /= length;
    }
    // The touch joystick steers when it is held (a light push sneaks).
    const stick = this.touch.movement;
    if (stick) {
      moveX = stick.x;
      moveY = stick.y;
    }
    // Playing by touch: no pointer, so stones and beams go the way the player faces.
    const aim = this.touching && this.touch.currentMode ? null : this.aim;

    const frame: InputFrame = {
      moveX,
      moveY,
      navX: (s.wasPressed('moveRight') ? 1 : 0) - (s.wasPressed('moveLeft') ? 1 : 0),
      navY: (s.wasPressed('moveDown') ? 1 : 0) - (s.wasPressed('moveUp') ? 1 : 0),
      sneak: s.isDown('sneak') || stick?.sneak === true,
      pingHeld: s.isDown('ping'),
      ping: s.wasPressed('ping'),
      throwStone: s.wasPressed('throwStone'),
      shockwave: s.wasPressed('shockwave'),
      useTool: s.wasPressed('useTool'),
      confirm: s.wasPressed('confirm'),
      click: s.wasPressed('click'),
      back: s.wasPressed('back'),
      pause: s.wasPressed('pause'),
      toggleDebug: s.wasPressed('toggleDebug'),
      toggleMute: s.wasPressed('toggleMute'),
      debugNewMap: s.wasPressed('debugNewMap'),
      debugOverview: s.wasPressed('debugOverview'),
      debugWarp: s.wasPressed('debugWarp'),
      debugDrop: s.wasPressed('debugDrop'),
      debugHearing: s.wasPressed('debugHearing'),
      aim,
    };
    s.endTick();
    return frame;
  }

  dispose(): void {
    this.detach();
    this.state.releaseAll();
  }

  private inputDown(id: string): boolean {
    if (this.capture) {
      const callback = this.capture;
      this.capture = null;
      callback(id);
      return true;
    }
    const actions = this.byInput.get(id);
    if (!actions) return false;
    for (const action of actions) this.state.press(action, id);
    return true;
  }

  private inputUp(id: string): void {
    const actions = this.byInput.get(id);
    if (!actions) return;
    for (const action of actions) this.state.release(action, id);
  }
}
