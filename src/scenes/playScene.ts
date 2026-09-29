import { AudioDirector } from '@/audio/audioDirector';
import { DIFFICULTIES } from '@/config/difficulty';
import { GAME } from '@/config/game';
import { THEME } from '@/config/theme';
import type { InputFrame } from '@/input/inputFrame';
import { randomSeed } from '@/platform/seed';
import { Camera } from '@/render/camera';
import { drawHud } from '@/render/hud';
import { drawAimReticle, playerDrawPosition } from '@/render/playerRenderer';
import { drawText } from '@/render/text';
import { WorldRenderer } from '@/render/worldRenderer';
import type { PlayerInput } from '@/sim/playerInput';
import { roundResult, scoreRound } from '@/sim/scoring';
import { levelDef } from '@/sim/level';
import { createSimulation, type Simulation } from '@/sim/simulation';
import type { RunState } from './run';
import { Tutorial } from './tutorial';
import type { AppContext, Scene } from './scene';

/** Seconds the "LEVEL n" banner stays up. */
const BANNER_TIME = 3;
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
  private audio: AudioDirector | null = null;
  private tutorial: Tutorial | null = null;
  /** A menu is open on top: keep the world, hide banners and prompts. */
  private covered = false;
  private overview = false;
  private endedAt: number | null = null;
  /** Last pointer position (screen px), for the stone reticle. */
  private aimScreen: InputFrame['aim'] = null;

  constructor(app: AppContext, params: { run: RunState }) {
    this.app = app;
    this.camera = new Camera(app.viewport);
    this.run = params.run;
    this.start();
  }

  update(dt: number, input: InputFrame): void {
    if (input.back || input.pause) {
      this.app.open('pause');
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

    this.aimScreen = input.aim;
    this.sim.step(this.toPlayerInput(input), dt);
    this.world.tick(dt);
    this.audio?.tick();
    this.tutorial?.tick(dt);
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
      if (this.aimScreen && state.player.stones > 0 && state.status === 'playing') {
        const aim = this.camera.screenToWorld(this.aimScreen.x, this.aimScreen.y);
        drawAimReticle(ctx, focus, aim, this.camera.pixel);
      }
    }
    ctx.restore();

    drawHud(ctx, state);
    if (!this.covered) {
      this.drawLevelBanner(ctx, state.time);
      this.drawTutorial(ctx);
    }
    drawText(ctx, `LEVEL ${this.run.level} · SEED ${this.run.seed}`, width - 12, height - 12, {
      size: 11,
      color: THEME.colors.white,
      align: 'right',
      alpha: 0.35,
    });
    const hint = debug
      ? 'T warp · H hearing · O overview · N new map · F1 hide debug · ESC menu'
      : 'WASD move · SHIFT sneak · SPACE ping · Q stone · CLICK/E shockwave · M mute · ESC pause';
    drawText(ctx, hint, width / 2, height - 12, {
      size: 12,
      color: THEME.colors.white,
      align: 'center',
      alpha: 0.4,
    });
  }

  /** The pause menu (or anything else) opened on top: quiet the tension drone. */
  pause(): void {
    this.covered = true;
    this.app.sound.stopDrone();
  }

  resume(): void {
    this.covered = false;
  }

  onHidden(): void {
    if (this.sim.state.status === 'playing') this.app.open('pause');
  }

  exit(): void {
    this.audio?.dispose();
    this.audio = null;
    this.tutorial?.dispose();
    this.tutorial = null;
  }

  private start(): void {
    this.exit();
    this.sim = createSimulation({ seed: this.run.seed, level: this.run.level });
    this.world = new WorldRenderer(this.sim, DIFFICULTIES[this.run.difficulty].ghostAlpha);
    this.audio = new AudioDirector(this.sim, this.app.sound);
    if (levelDef(this.run.level).tutorial) this.tutorial = new Tutorial(this.sim);
    this.endedAt = null;
    this.sim.events.on('roundEnded', (e) => (this.endedAt = e.time));
    this.sim.events.on('soundEmitted', (s) => {
      if (s.kind !== 'shockwave') return;
      const { strength, duration } = THEME.shake.shockwave;
      this.camera.shake(strength, duration);
    });
    this.sim.events.on('playerHit', () => {
      const { strength, duration } = THEME.shake.hit;
      this.camera.shake(strength, duration);
    });
    this.app.debug.watch('seed', `${this.run.seed} (map ${this.sim.state.layout.seed})`);
  }

  /** "LEVEL 4 · 3 HUNTERS · PING 3s" for the first seconds of a level. */
  private drawLevelBanner(ctx: CanvasRenderingContext2D, time: number): void {
    if (time > BANNER_TIME) return;
    const alpha = Math.min(1, (BANNER_TIME - time) / 0.6, time / 0.3);
    const { width, height } = this.app.viewport;
    const { hunters, rules, layout } = this.sim.state;
    drawText(ctx, `LEVEL ${this.run.level}`, width / 2, height * 0.3, {
      size: 34,
      color: THEME.colors.cyan,
      align: 'center',
      glow: THEME.glowBlur,
      alpha,
    });
    const counts = new Map<string, number>();
    for (const h of hunters) counts.set(h.type, (counts.get(h.type) ?? 0) + 1);
    const parts = [...counts].map(([type, n]) => `${n} ${type.toUpperCase()}${n > 1 ? 'S' : ''}`);
    if (rules.pingCooldown !== GAME.abilities.ping.cooldown)
      parts.push(`PING ${rules.pingCooldown}s`);
    const scale = layout.tiles.width / (GAME.map.cellsX * 2 + 1);
    if (scale > 1.01) parts.push(`MAP +${Math.round((scale - 1) * 100)}%`);
    parts.push(DIFFICULTIES[this.run.difficulty].label);
    drawText(ctx, parts.join(' · '), width / 2, height * 0.3 + 28, {
      size: 13,
      color: THEME.colors.white,
      align: 'center',
      alpha: alpha * 0.8,
    });
  }

  private drawTutorial(ctx: CanvasRenderingContext2D): void {
    const tutorial = this.tutorial;
    const text = tutorial?.text;
    if (!tutorial || !text) return;
    const { width, height } = this.app.viewport;
    const alpha = tutorial.opacity;
    const y = height - 56;
    ctx.save();
    ctx.font = `14px ${THEME.font}`;
    const w = ctx.measureText(text).width + 32;
    ctx.globalAlpha = alpha * 0.7;
    ctx.fillStyle = '#000';
    ctx.fillRect(width / 2 - w / 2, y - 20, w, 30);
    ctx.globalAlpha = alpha * 0.6;
    ctx.strokeStyle = THEME.colors.cyan;
    ctx.strokeRect(width / 2 - w / 2 + 0.5, y - 19.5, w - 1, 29);
    ctx.restore();
    drawText(ctx, text, width / 2, y, {
      size: 14,
      color: THEME.colors.white,
      align: 'center',
      alpha,
    });
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
