import { SOUND_KINDS } from '@/config/sounds';
import { THEME } from '@/config/theme';
import type { InputFrame } from '@/input/inputFrame';
import { randomSeed } from '@/platform/seed';
import { Camera } from '@/render/camera';
import { drawFullMap } from '@/render/mapDebug';
import { drawPlayer, playerDrawPosition } from '@/render/playerRenderer';
import { drawText } from '@/render/text';
import type { SoundEmitted } from '@/sim/events';
import type { PlayerInput } from '@/sim/playerInput';
import { createSimulation, type Simulation } from '@/sim/simulation';
import type { AppContext, Scene } from './scene';

/** Debug sound markers stay visible this long (s). Real sound rings arrive in Phase 4. */
const DEBUG_SOUND_LIFETIME = 0.6;
/** Share of the screen the debug overview map may fill. */
const OVERVIEW_MARGIN = 0.92;

/**
 * Gameplay. Phase 3: the player walks the dark maze. Walls only become
 * visible through sound in Phase 4; until then F1 shows the map.
 */
export class PlayScene implements Scene {
  readonly name = 'Play';
  private readonly app: AppContext;
  private readonly camera: Camera;
  private sim!: Simulation;
  private overview = false;
  private debugSounds: SoundEmitted[] = [];
  private stepCount = 0;
  private bumpCount = 0;

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

    const { player, time } = this.sim.state;
    this.debugSounds = this.debugSounds.filter((s) => time - s.time < DEBUG_SOUND_LIFETIME);
    const tiles = this.sim.state.layout.tiles;
    debug.watch('pos', `${player.x.toFixed(0)}, ${player.y.toFixed(0)}`);
    debug.watch('tile', `${tiles.toTile(player.x)}, ${tiles.toTile(player.y)}`);
    debug.watch('speed', Math.round(Math.hypot(player.vx, player.vy)));
    debug.watch('mode', player.sneaking ? 'sneak' : 'walk');
    debug.watch('sounds', `${this.stepCount} steps, ${this.bumpCount} bumps`);
  }

  render(ctx: CanvasRenderingContext2D, alpha: number): void {
    const { player, layout, walls } = this.sim.state;
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
    } else {
      const focus = playerDrawPosition(player, alpha);
      this.camera.follow(focus.x, focus.y, tiles.worldWidth, tiles.worldHeight);
      this.camera.apply(ctx);
      if (debug) drawFullMap(ctx, layout, walls, this.camera.pixel, true);
    }
    if (debug) this.drawDebugSounds(ctx);
    drawPlayer(ctx, player, alpha);
    ctx.restore();

    drawText(ctx, `SEED ${layout.seed}`, 12, 20, {
      size: 12,
      color: THEME.colors.white,
      alpha: 0.5,
    });
    const hint = debug
      ? 'M overview · N new map · F1 hide debug · ESC menu'
      : 'WASD move · SHIFT sneak · F1 debug view (walls appear with sound in Phase 4) · ESC menu';
    drawText(ctx, hint, width / 2, height - 12, {
      size: 12,
      color: THEME.colors.white,
      align: 'center',
      alpha: 0.4,
    });
  }

  private start(seed: number): void {
    this.sim = createSimulation(seed);
    this.debugSounds = [];
    this.stepCount = 0;
    this.bumpCount = 0;
    this.sim.events.on('soundEmitted', (sound) => {
      this.debugSounds.push(sound);
      if (sound.kind === 'step') this.stepCount++;
      if (sound.kind === 'wallBump') this.bumpCount++;
    });
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

  /** Placeholder rings so footsteps and bumps can be checked before Phase 4. */
  private drawDebugSounds(ctx: CanvasRenderingContext2D): void {
    const now = this.sim.state.time;
    ctx.lineWidth = this.camera.pixel * 1.5;
    for (const s of this.debugSounds) {
      const age = (now - s.time) / DEBUG_SOUND_LIFETIME;
      const kind = SOUND_KINDS[s.kind];
      ctx.globalAlpha = 1 - age;
      ctx.strokeStyle = THEME.colors[kind.color];
      ctx.beginPath();
      ctx.arc(s.x, s.y, kind.maxRadius * age, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
}
