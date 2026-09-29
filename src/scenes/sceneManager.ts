import type { InputFrame } from '@/input/inputFrame';
import type { Scene } from './scene';

/**
 * A stack of scenes. Only the top scene updates. Drawing starts at the
 * highest non-overlay scene, so a pause overlay shows the game beneath it.
 *
 * Changes requested during update() are applied right after it, so a
 * scene never keeps running after it has exited.
 */
export class SceneManager {
  private readonly stack: Scene[] = [];
  private readonly pending: (() => void)[] = [];
  private updating = false;

  get current(): Scene | undefined {
    return this.stack[this.stack.length - 1];
  }

  get depth(): number {
    return this.stack.length;
  }

  /** Exit every scene and start `scene`. */
  switchTo(scene: Scene): void {
    this.apply(() => {
      while (this.stack.length > 0) this.stack.pop()?.exit?.();
      this.stack.push(scene);
      scene.enter?.();
    });
  }

  /** Open `scene` on top; the one below is kept (and drawn if `scene.overlay`). */
  push(scene: Scene): void {
    this.apply(() => {
      this.stack.push(scene);
      scene.enter?.();
    });
  }

  /** Close the top scene and resume the one below. */
  pop(): void {
    this.apply(() => this.stack.pop()?.exit?.());
  }

  update(dt: number, input: InputFrame): void {
    this.updating = true;
    try {
      this.current?.update(dt, input);
    } finally {
      this.updating = false;
      this.flush();
    }
  }

  render(ctx: CanvasRenderingContext2D, alpha: number): void {
    let first = this.stack.length - 1;
    while (first > 0 && this.stack[first].overlay) first--;
    for (let i = Math.max(first, 0); i < this.stack.length; i++) {
      this.stack[i].render(ctx, alpha);
    }
  }

  private apply(change: () => void): void {
    if (this.updating) this.pending.push(change);
    else change();
  }

  private flush(): void {
    while (this.pending.length > 0) this.pending.shift()?.();
  }
}
