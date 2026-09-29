import type { Action } from '@/config/input';

/**
 * Which actions are held, and which were pressed since the last simulation
 * tick. Presses are latched until endTick(), so a tap shorter than one tick,
 * or a fast-monitor frame that runs zero ticks, is never lost.
 *
 * Holds are tracked per input id: with W and ArrowUp both held, releasing
 * one of them keeps moveUp down.
 */
export class ActionState {
  private readonly holders = new Map<Action, Set<string>>();
  private readonly pressed = new Set<Action>();

  press(action: Action, inputId: string): void {
    let set = this.holders.get(action);
    if (!set) {
      set = new Set();
      this.holders.set(action, set);
    }
    // Only the first holder counts as a press (ignores key repeat and a second key).
    if (set.size === 0) this.pressed.add(action);
    set.add(inputId);
  }

  release(action: Action, inputId: string): void {
    this.holders.get(action)?.delete(inputId);
  }

  isDown(action: Action): boolean {
    return (this.holders.get(action)?.size ?? 0) > 0;
  }

  wasPressed(action: Action): boolean {
    return this.pressed.has(action);
  }

  /** Call once per tick, after the tick has read the presses. */
  endTick(): void {
    this.pressed.clear();
  }

  /** Drop every hold, e.g. when the window loses focus and key-ups would be missed. */
  releaseAll(): void {
    this.holders.clear();
  }
}
