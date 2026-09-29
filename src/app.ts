import { GAME } from '@/config/game';
import { THEME } from '@/config/theme';
import { FixedLoop } from '@/core/loop';
import { InputManager } from '@/input/inputManager';
import { startFrameDriver } from '@/platform/frameDriver';
import { Viewport } from '@/platform/viewport';
import { DebugLayer } from '@/render/debugLayer';
import { createScene } from '@/scenes/registry';
import type { AppContext, SceneArgs, SceneId } from '@/scenes/scene';
import { SceneManager } from '@/scenes/sceneManager';

/** Create the services, wire them into the fixed-step loop and open the menu. */
export function startApp(canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas context not available');

  const viewport = new Viewport(canvas, GAME.camera.viewSize, GAME.render.maxDpr);
  const input = new InputManager(canvas);
  const debug = new DebugLayer();
  const scenes = new SceneManager();

  const app: AppContext = {
    viewport,
    debug,
    goTo<K extends SceneId>(id: K, ...args: SceneArgs<K>): void {
      debug.clearWatches();
      scenes.switchTo(createScene(app, id, ...args));
    },
  };

  const loop = new FixedLoop({
    step: 1 / GAME.loop.tickRate,
    maxFrameDelta: GAME.loop.maxFrameDelta,
    update: (dt) => {
      const frame = input.sample();
      if (frame.toggleDebug) debug.toggle();
      scenes.update(dt, frame);
      debug.tick();
    },
    render: (alpha, frameDelta) => {
      debug.frame(frameDelta);
      viewport.beginFrame(ctx, THEME.background);
      scenes.render(ctx, alpha);
      debug.render(ctx, viewport, scenes.current?.name ?? '-');
    },
  });

  app.goTo('menu');
  startFrameDriver(loop);
}
