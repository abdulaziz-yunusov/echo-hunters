import { DEFAULT_BINDINGS, type Action } from '@/config/input';
import { ActionState } from './actionState';
import type { InputFrame } from './inputFrame';
import { attachKeyboardMouse } from './keyboardMouse';

export type Bindings = Readonly<Record<Action, readonly string[]>>;

/**
 * Owns all input devices and turns them into one InputFrame per simulation
 * tick. Touch controls (Phase 12) plug in here as another device.
 */
export class InputManager {
  private readonly state = new ActionState();
  private readonly byInput = new Map<string, Action[]>();
  private aim: { x: number; y: number } | null = null;
  private readonly detach: () => void;

  constructor(canvas: HTMLCanvasElement, bindings: Bindings = DEFAULT_BINDINGS) {
    this.setBindings(bindings);
    this.detach = attachKeyboardMouse(canvas, {
      down: (id) => this.inputDown(id),
      up: (id) => this.inputUp(id),
      pointer: (x, y) => {
        this.aim = { x, y };
      },
      lost: () => this.state.releaseAll(),
    });
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

    const frame: InputFrame = {
      moveX,
      moveY,
      sneak: s.isDown('sneak'),
      ping: s.wasPressed('ping'),
      throwStone: s.wasPressed('throwStone'),
      shockwave: s.wasPressed('shockwave'),
      confirm: s.wasPressed('confirm'),
      back: s.wasPressed('back'),
      pause: s.wasPressed('pause'),
      toggleDebug: s.wasPressed('toggleDebug'),
      debugNewMap: s.wasPressed('debugNewMap'),
      debugOverview: s.wasPressed('debugOverview'),
      aim: this.aim,
    };
    s.endTick();
    return frame;
  }

  dispose(): void {
    this.detach();
    this.state.releaseAll();
  }

  private inputDown(id: string): boolean {
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
