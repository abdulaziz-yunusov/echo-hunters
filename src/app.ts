import { AudioEngine } from '@/audio/audioEngine';
import { WebAudioOutput } from '@/audio/webAudioOutput';
import { GAME } from '@/config/game';
import { THEME } from '@/config/theme';
import { FixedLoop } from '@/core/loop';
import { withOverrides } from '@/input/bindings';
import { InputManager } from '@/input/inputManager';
import { startFrameDriver } from '@/platform/frameDriver';
import { loadSave, updateSave } from '@/platform/storage';
import { Viewport } from '@/platform/viewport';
import { DebugLayer } from '@/render/debugLayer';
import { applyPalette } from '@/render/palette';
import { drawText } from '@/render/text';
import { createScene } from '@/scenes/registry';
import type { AppContext, SceneArgs, SceneId } from '@/scenes/scene';
import { SceneManager } from '@/scenes/sceneManager';

/** Create the services, wire them into the fixed-step loop and open the menu. */
export function startApp(canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas context not available');

  const viewport = new Viewport(canvas, GAME.camera.viewSize, GAME.render.maxDpr);
  const save = loadSave();
  applyPalette(save.display.palette);
  const input = new InputManager(canvas, withOverrides(save.bindings));
  const debug = new DebugLayer();
  const scenes = new SceneManager();
  const audio = new AudioEngine(save.audio);
  const sound = new WebAudioOutput(audio);

  const app: AppContext = {
    viewport,
    debug,
    audio,
    sound,
    input,
    goTo<K extends SceneId>(id: K, ...args: SceneArgs<K>): void {
      debug.clearWatches();
      scenes.switchTo(createScene(app, id, ...args));
    },
    open<K extends SceneId>(id: K, ...args: SceneArgs<K>): void {
      scenes.push(createScene(app, id, ...args));
    },
    close(): void {
      if (scenes.depth > 1) scenes.pop();
    },
  };

  // Leaving the tab pauses the game (the loop also stops while hidden).
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) scenes.current?.onHidden?.();
  });

  const loop = new FixedLoop({
    step: 1 / GAME.loop.tickRate,
    maxFrameDelta: GAME.loop.maxFrameDelta,
    update: (dt) => {
      const frame = input.sample();
      if (frame.toggleDebug) debug.toggle();
      if (frame.toggleMute) {
        audio.setMuted(!audio.muted);
        updateSave({ audio: audio.getSettings() });
      }
      scenes.update(dt, frame);
      debug.tick();
    },
    render: (alpha, frameDelta) => {
      debug.frame(frameDelta);
      viewport.beginFrame(ctx, THEME.background);
      scenes.render(ctx, alpha);
      if (audio.muted) {
        drawText(ctx, 'MUTED (M)', 12, viewport.height - 12, {
          size: 11,
          color: THEME.colors.white,
          alpha: 0.45,
        });
      }
      debug.render(ctx, viewport, scenes.current?.name ?? '-');
      // Exposed for automated checks (which screen is showing).
      canvas.dataset.scene = scenes.current?.name ?? '';
    },
  });

  app.goTo('menu');
  startFrameDriver(loop);
}
