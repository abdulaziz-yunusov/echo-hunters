import { DEFAULT_DIFFICULTY, DIFFICULTIES } from '@/config/difficulty';
import { THEME } from '@/config/theme';
import type { InputFrame } from '@/input/inputFrame';
import { randomSeed } from '@/platform/seed';
import { Camera } from '@/render/camera';
import { drawHud } from '@/render/hud';
import { playerDrawPosition } from '@/render/playerRenderer';
import { drawText } from '@/render/text';
import { WorldRenderer } from '@/render/worldRenderer';
import type { PlayerInput } from '@/sim/playerInput';
import { roundResult, scoreRound } from '@/sim/scoring';
import { createSimulation, type Simulation } from '@/sim/simulation';
import type { RunState } from './run';
import type { AppContext, Scene } from './scene';

/** Share of the screen the debug overview map may fill. */
const OVERVIEW_MARGIN = 0.92;
/** Seconds to linger on the world after extraction before the score screen. */
const END_DELAY = 1.2;

/** One level of a run: the dark maze, seen only through sound. */
export class PlayScene implements Scene {
  readonly name = 'Play';
  private readonly app: AppContext;
  private readonly camera: Camera;
  private run: RunState;
  private sim!: Simulation;
  private world!: WorldRenderer;
  private overview = false;
  private endedAt: number | null = null;

  constructor(app: AppContext, params: { run: RunState }) {
    this.app = app;
    this.camera = new Camera(app.viewport);
    this.run = params.run;
    this.start();
  }

  update(dt: number, input: InputFrame): void {
    if (input.back) {
      this.app.goTo('menu');
      return;
    }
    const debug = this.app.debug;
    if (debug.enabled && input.debugNewMap) {
      this.run = { ...this.run, seed: randomSeed() };
      this.start();
    }
    if (debug.enabled && input.debugOverview) this.overview = !this.overview;
    if (debug.enabled && input.debugWarp) this.warpToObjective();
    if (debug.enabled && input.debugHearing) {
      const s = this.sim.state;
      s.hearingModel = s.hearingModel === 'path' ? 'los' : 'path';
    }

    this.sim.step(this.toPlayerInput(input), dt);
    this.world.tick(dt);
    this.camera.update(dt);

    const { state } = this.sim;
    if (this.endedAt !== null && state.time - this.endedAt >= END_DELAY) {
      this.finishLevel();
      return;
    }

    const { player, waves } = state;
    const tiles = state.layout.tiles;
    debug.watch('pos', `${player.x.toFixed(0)}, ${player.y.toFixed(0)}`);
    debug.watch('tile', `${tiles.toTile(player.x)}, ${tiles.toTile(player.y)}`);
    debug.watch('mode', player.sneaking ? 'sneak' : 'walk');
    debug.watch('waves', `${waves.length} active, ${this.world.revealingWaves} revealing`);
    debug.watch('time', `${state.time.toFixed(1)} s, ${player.pingsUsed} pings`);
    debug.watch('hearing', `${state.hearingModel} (H to switch)`);
    state.hunters.forEach((h, i) => debug.watch(`hunter ${i + 1}`, `${h.type} ${h.state}`));
  }

  render(ctx: CanvasRenderingContext2D, alpha: number): void {
    const { state } = this.sim;
    const { tiles } = state.layout;
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
      this.world.drawOverview(ctx, 1 / scale, alpha);
    } else {
      const focus = playerDrawPosition(state.player, alpha);
      this.camera.follow(focus.x, focus.y, tiles.worldWidth, tiles.worldHeight);
      this.camera.apply(ctx);
      this.world.draw(ctx, this.camera, alpha, debug);
    }
    ctx.restore();

    drawHud(ctx, state);
    drawText(ctx, `LEVEL ${this.run.level} · SEED ${this.run.seed}`, width - 12, height - 12, {
      size: 11,
      color: THEME.colors.white,
      align: 'right',
      alpha: 0.35,
    });
    const hint = debug
      ? 'T warp · H hearing · M overview · N new map · F1 hide debug · ESC menu'
      : 'WASD move · SHIFT sneak · SPACE ping · F1 debug · ESC menu';
    drawText(ctx, hint, width / 2, height - 12, {
      size: 12,
      color: THEME.colors.white,
      align: 'center',
      alpha: 0.4,
    });
  }

  private start(): void {
    this.sim = createSimulation({ seed: this.run.seed, level: this.run.level });
    this.world = new WorldRenderer(this.sim, DIFFICULTIES[DEFAULT_DIFFICULTY].ghostAlpha);
    this.endedAt = null;
    this.sim.events.on('roundEnded', (e) => (this.endedAt = e.time));
    this.sim.events.on('playerHit', () => {
      const { strength, duration } = THEME.shake.hit;
      this.camera.shake(strength, duration);
    });
    this.app.debug.watch('seed', `${this.run.seed} (map ${this.sim.state.layout.seed})`);
  }

  private finishLevel(): void {
    const { state } = this.sim;
    const score = scoreRound(roundResult(state));
    if (state.status === 'extracted') {
      this.app.goTo('levelEnd', { run: this.run, score, seconds: this.endedAt ?? state.time });
    } else {
      this.app.goTo('gameOver', { run: this.run, score });
    }
  }

  /**
   * Debug only: jump to the nearest remaining core, else to the beacon. The
   * game's own rules then collect or extract. (Edits sim state from outside,
   * so never use it outside debug: it would break replays.)
   */
  private warpToObjective(): void {
    const { player, cores, beacon } = this.sim.state;
    const remaining = cores.filter((c) => !c.collected);
    const target =
      remaining.sort(
        (a, b) =>
          Math.hypot(a.x - player.x, a.y - player.y) - Math.hypot(b.x - player.x, b.y - player.y),
      )[0] ?? beacon;
    player.x = player.prevX = target.x;
    player.y = player.prevY = target.y;
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
