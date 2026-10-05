import type { InputFrame } from '@/input/inputFrame';
import type { TouchMode } from '@/config/touch';
import type { Viewport } from '@/platform/viewport';
import type { AudioEngine } from '@/audio/audioEngine';
import type { InputManager } from '@/input/inputManager';
import type { SoundOutput } from '@/audio/soundOutput';
import type { DebugLayer } from '@/render/debugLayer';
import type { ScoreBreakdown } from '@/sim/scoring';
import type { Replay } from '@/replay/replay';
import type { DuelEndParams } from './duelEndScene';
import type { DuelParams } from './duelScene';
import type { RunState } from './run';

/** A screen of the game: menu, gameplay, level end, … */
export interface Scene {
  /** Shown in the debug overlay. */
  readonly name: string;
  /** If true, the scene below is drawn first (e.g. a pause menu over the game). */
  readonly overlay?: boolean;
  /** On-screen touch controls this scene shows right now (Phase 12); none = taps are clicks. */
  readonly touchControls?: TouchMode | null;
  enter?(): void;
  exit?(): void;
  /** Another scene opened on top of this one. */
  pause?(): void;
  /** The scene on top closed; this one is in charge again. */
  resume?(): void;
  /** The browser tab was hidden (e.g. to pause the game). */
  onHidden?(): void;
  /** The tab is visible again (a duel tells the rival it is back, Phase 31). */
  onShown?(): void;
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
  levelEnd: { run: RunState; score: ScoreBreakdown; seconds: number; replay?: Replay };
  gameOver: { run: RunState; score: ScoreBreakdown; replay?: Replay };
  /** `viewerId`: whose path is "you" in a duel debrief (default: the recorded player). */
  replay: { replay: Replay; viewerId?: number };
  howToPlay: undefined;
  settings: undefined;
  controls: undefined;
  pause: undefined;
  duelLobby: undefined;
  duel: DuelParams;
  duelEnd: DuelEndParams;
}

export type SceneId = keyof SceneParams;

export type SceneArgs<K extends SceneId> = SceneParams[K] extends undefined
  ? []
  : [params: SceneParams[K]];

/** Services every scene may use. Scenes never import each other; they navigate by id. */
export interface AppContext {
  readonly viewport: Viewport;
  readonly debug: DebugLayer;
  readonly audio: AudioEngine;
  /** Where scenes send sound (through an AudioDirector). */
  readonly sound: SoundOutput;
  readonly input: InputManager;
  /** Replace every open scene with this one. */
  goTo<K extends SceneId>(id: K, ...args: SceneArgs<K>): void;
  /** Open a scene on top (the one below waits, e.g. settings over the pause menu). */
  open<K extends SceneId>(id: K, ...args: SceneArgs<K>): void;
  /** Close the top scene and return to the one below. */
  close(): void;
}
