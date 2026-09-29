import { DEFAULT_DIFFICULTY, DIFFICULTIES } from '@/config/difficulty';
import { GAME } from '@/config/game';
import { THEME } from '@/config/theme';
import type { InputFrame } from '@/input/inputFrame';
import { randomSeed } from '@/platform/seed';
import { Camera } from '@/render/camera';
import { drawHud } from '@/render/hud';
import { drawFullMap } from '@/render/mapDebug';
import { drawPlayer, playerDrawPosition } from '@/render/playerRenderer';
import { RevealMap } from '@/render/revealMap';
import { drawText } from '@/render/text';
import { WallLayer } from '@/render/wallLayer';
import { drawWavePolygons, drawWaves } from '@/render/waveLayer';
import type { PlayerInput } from '@/sim/playerInput';
import { createSimulation, type Simulation } from '@/sim/simulation';
import type { AppContext, Scene } from './scene';

/** Share of the screen the debug overview map may fill. */
const OVERVIEW_MARGIN = 0.92;
/** Opacity of the full map under the debug view, so real reveals stay visible on top. */
const DEBUG_MAP_ALPHA = 0.3;

/** Gameplay. Phase 4: the dark maze is seen only through sound. */
export class PlayScene implements Scene {
  readonly name = 'Play';
  private readonly app: AppContext;
  private readonly camera: Camera;
  private sim!: Simulation;
  private reveal!: RevealMap;
  private wallLayer!: WallLayer;
  private overview = false;
  private readonly ghostAlpha = DIFFICULTIES[DEFAULT_DIFFICULTY].ghostAlpha;

  constructor(app: AppContext, params: { seed: number }) {
    this.app = app;
    this.camera = new Camera(app.viewport);
    this.start(params.seed);
  }

  update(dt: number, input: InputFrame): void {
    if (input.back) {
      this.app.goTo('menu');
      return;
    }
    const debug = this.app.debug;
    if (debug.enabled && input.debugNewMap) this.start(randomSeed());
    if (debug.enabled && input.debugOverview) this.overview = !this.overview;

    this.sim.step(this.toPlayerInput(input), dt);
    this.reveal.update(this.sim.state.time);

    const { player, waves } = this.sim.state;
    const tiles = this.sim.state.layout.tiles;
    debug.watch('pos', `${player.x.toFixed(0)}, ${player.y.toFixed(0)}`);
    debug.watch('tile', `${tiles.toTile(player.x)}, ${tiles.toTile(player.y)}`);
    debug.watch('speed', Math.round(Math.hypot(player.vx, player.vy)));
    debug.watch('mode', player.sneaking ? 'sneak' : 'walk');
    debug.watch('waves', `${waves.length} active, ${this.reveal.activeWaves} revealing`);
    debug.watch('pings', player.pingsUsed);
  }

  render(ctx: CanvasRenderingContext2D, alpha: number): void {
    const { state } = this.sim;
    const { player, layout, walls, waves } = state;
    const { tiles } = layout;
    const debug = this.app.debug.enabled;
    const { width, height } = this.app.viewport;

    ctx.save();
    if (debug && this.overview) {
      const scale =
        Math.min(width / tiles.worldWidth, height / tiles.worldHeight) * OVERVIEW_MARGIN;
      ctx.translate(
        (width - tiles.worldWidth * scale) / 2,
        (height - tiles.worldHeight * scale) / 2,
      );
      ctx.scale(scale, scale);
      drawFullMap(ctx, layout, walls, 1 / scale, true);
      drawWavePolygons(ctx, waves, 1 / scale);
      drawPlayer(ctx, player, alpha);
    } else {
      const focus = playerDrawPosition(player, alpha);
      this.camera.follow(focus.x, focus.y, tiles.worldWidth, tiles.worldHeight);
      this.camera.apply(ctx);
      const pixel = this.camera.pixel;

      if (debug) {
        ctx.globalAlpha = DEBUG_MAP_ALPHA;
        drawFullMap(ctx, layout, walls, pixel, true);
        ctx.globalAlpha = 1;
      }
      this.wallLayer.draw(
        ctx,
        this.reveal,
        state.time,
        this.camera.visibleBounds(),
        pixel,
        GAME.reveal.fadeMs / 1000,
        this.ghostAlpha,
      );
      drawWaves(ctx, waves, alpha / GAME.loop.tickRate, pixel);
      if (debug) drawWavePolygons(ctx, waves, pixel);
      drawPlayer(ctx, player, alpha);
    }
    ctx.restore();

    drawHud(ctx, state);
    drawText(ctx, `SEED ${layout.seed}`, width - 12, height - 12, {
      size: 11,
      color: THEME.colors.white,
      align: 'right',
      alpha: 0.35,
    });
    const hint = debug
      ? 'M overview · N new map · F1 hide debug · ESC menu'
      : 'WASD move · SHIFT sneak · SPACE ping · F1 debug · ESC menu';
    drawText(ctx, hint, width / 2, height - 12, {
      size: 12,
      color: THEME.colors.white,
      align: 'center',
      alpha: 0.4,
    });
  }

  private start(seed: number): void {
    this.sim = createSimulation(seed);
    this.reveal = new RevealMap(this.sim.state.walls);
    this.wallLayer = new WallLayer(this.sim.state.walls);
    this.sim.events.on('soundEmitted', (sound) => this.reveal.addWave(sound.wave));
    this.app.debug.watch('seed', this.sim.state.layout.seed);
  }

  private toPlayerInput(input: InputFrame): PlayerInput {
    return {
      moveX: input.moveX,
      moveY: input.moveY,
      sneak: input.sneak,
      ping: input.ping,
      throwStone: input.throwStone,
      shockwave: input.shockwave,
      aim: input.aim ? this.camera.screenToWorld(input.aim.x, input.aim.y) : null,
    };
  }
}
