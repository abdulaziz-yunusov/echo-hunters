import type { InputFrame } from '@/input/inputFrame';
import type { Viewport } from '@/platform/viewport';
import type { DebugLayer } from '@/render/debugLayer';
import type { ScoreBreakdown } from '@/sim/scoring';
import type { RunState } from './run';

/** A screen of the game: menu, gameplay, level end, … */
export interface Scene {
  /** Shown in the debug overlay. */
  readonly name: string;
  /** If true, the scene below is drawn first (e.g. a pause menu over the game). */
  readonly overlay?: boolean;
  enter?(): void;
  exit?(): void;
  /** Fixed-step update; only the top scene receives it. */
  update(dt: number, input: InputFrame): void;
  /** @param alpha 0..1 between the last tick and the next, for smooth drawing. */
  render(ctx: CanvasRenderingContext2D, alpha: number): void;
}

/**
 * Parameters each scene is opened with. Add a scene by adding an entry here
 * and a factory in registry.ts. Use `undefined` for scenes without parameters.
 */
export interface SceneParams {
  menu: undefined;
  play: { run: RunState };
  levelEnd: { run: RunState; score: ScoreBreakdown; seconds: number };
  gameOver: { run: RunState; score: ScoreBreakdown };
}

export type SceneId = keyof SceneParams;

export type SceneArgs<K extends SceneId> = SceneParams[K] extends undefined
  ? []
  : [params: SceneParams[K]];

/** Services every scene may use. Scenes never import each other; they navigate by id. */
export interface AppContext {
  readonly viewport: Viewport;
  readonly debug: DebugLayer;
  /** Replace the current scene(s). */
  goTo<K extends SceneId>(id: K, ...args: SceneArgs<K>): void;
}
