import { AudioDirector } from '@/audio/audioDirector';
import { DIFFICULTIES } from '@/config/difficulty';
import { GAME } from '@/config/game';
import { THEME } from '@/config/theme';
import type { InputFrame } from '@/input/inputFrame';
import { toPlayerInput } from '@/input/toPlayerInput';
import { randomSeed } from '@/platform/seed';
import { Camera } from '@/render/camera';
import { drawHud } from '@/render/hud';
import { drawAimGuide, playerDrawPosition } from '@/render/playerRenderer';
import { drawText, wrapLines } from '@/render/text';
import { ReplayRecorder } from '@/replay/recorder';
import { WorldRenderer } from '@/render/worldRenderer';
import { roundResult, scoreRound } from '@/sim/scoring';
import { levelDef, newHunterTypes } from '@/sim/level';
import { HUNTER_INFO } from '@/ui/hunterInfo';
import { createCustomSimulation, createSimulation, type Simulation } from '@/sim/simulation';
import { decodeMap } from '@/sim/world/customMap';
import { warpToObjective } from './debugWarp';
import type { RunState } from './run';
import { Tutorial } from './tutorial';
import { RoundDisplay } from './roundDisplay';
import type { AppContext, Scene } from './scene';

/** Seconds the "LEVEL n" banner stays up (longer when it names a new hunter). */
const BANNER_TIME = 3;
const BANNER_TIME_NEW_HUNTER = 5;
/** Share of the screen the debug overview map may fill. */
const OVERVIEW_MARGIN = 0.92;
/** Seconds to linger on the world after extraction before the score screen. */
const END_DELAY = 1.2;
/** Tutorial prompt line height, and its top when playing by touch (CSS px). */
const PROMPT_LINE = 20;
const PROMPT_TOP_TOUCH = 100;
/** Seconds a popup such as "CLOSE CALL +25" stays up. */
const POPUP_TIME = 1.4;

/** One level of a run: the dark maze, seen only through sound. */
export class PlayScene implements Scene {
  readonly name = 'Play';
  /** On-screen controls when playing by touch (Phase 12). */
  readonly touchControls = 'solo' as const;
  private readonly app: AppContext;
  private readonly camera: Camera;
  private run: RunState;
  private sim!: Simulation;
  private world!: WorldRenderer;
  private audio: AudioDirector | null = null;
  private tutorial: Tutorial | null = null;
  private recorder!: ReplayRecorder;
  private display!: RoundDisplay;
  /** "CLOSE CALL +25" and when it appeared (sim time). */
  private popup: { text: string; at: number } | null = null;
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
    if (debug.enabled && input.debugWarp) warpToObjective(this.sim.state);
    if (debug.enabled && input.debugHearing) {
      const s = this.sim.state;
      s.hearingModel = s.hearingModel === 'path' ? 'los' : 'path';
    }

    this.aimScreen = input.aim;
    this.sim.step(
      toPlayerInput(input, (x, y) => this.camera.screenToWorld(x, y)),
      dt,
    );
    this.recorder.afterStep();
    this.world.tick(dt);
    this.audio?.tick();
    this.display.update(dt);
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
      if (this.aimScreen && state.status === 'playing') {
        const aim = this.camera.screenToWorld(this.aimScreen.x, this.aimScreen.y);
        drawAimGuide(ctx, state.player, focus, aim, this.camera.pixel);
      }
    }
    ctx.restore();

    this.display.draw(ctx, width, height, playerDrawPosition(state.player, alpha));
    // Leave room for the touch pause button at the top right.
    drawHud(ctx, state, width - 64);
    if (!this.covered) {
      this.drawLevelBanner(ctx, state.time);
      this.drawTutorial(ctx);
      this.drawPopup(ctx, state.time);
    }
    const corner = this.run.custom
      ? 'CUSTOM MAP'
      : `${this.run.daily ? `DAILY ${this.run.daily} · ` : ''}LEVEL ${this.run.level} · SEED ${this.run.seed}`;
    drawText(ctx, corner, width - 12, height - 12, {
      size: 11,
      color: THEME.colors.white,
      align: 'right',
      alpha: 0.35,
    });
    const hint = debug
      ? 'T warp · H hearing · O overview · N new map · F1 hide debug · ESC menu'
      : this.app.input.usingTouch
        ? '' // the on-screen controls speak for themselves (Phase 12)
        : 'WASD move · SHIFT sneak · SPACE ping (hold: beam) · Q stone · CLICK/E shockwave · M mute · ESC pause';
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
    // Settings may have changed in a menu on top.
    this.display.refresh();
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
    // A hand-made map (Phase 13), or the run's next generated level.
    const custom = this.run.custom ? decodeMap(this.run.custom) : null;
    this.sim = custom
      ? createCustomSimulation(custom)
      : createSimulation({ seed: this.run.seed, level: this.run.level });
    this.world = new WorldRenderer(this.sim, DIFFICULTIES[this.run.difficulty].ghostAlpha);
    this.display = new RoundDisplay(this.camera, this.world);
    this.audio = new AudioDirector(this.sim, this.display.output(this.app.sound));
    this.popup = null;
    this.recorder = new ReplayRecorder(this.sim, this.run.seed);
    const prompts = custom ? undefined : levelDef(this.run.level).tutorial;
    if (prompts) this.tutorial = new Tutorial(this.sim, prompts, () => this.app.input.usingTouch);
    this.endedAt = null;
    this.sim.events.on('roundEnded', (e) => (this.endedAt = e.time));
    this.sim.events.on('closeCall', (e) => {
      const points = GAME.scoring.closeCall;
      this.popup = {
        text: e.scored ? `CLOSE CALL +${points}` : 'CLOSE CALL',
        at: this.sim.state.time,
      };
    });
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

  /**
   * "LEVEL 4 · 3 HUNTERS · PING 3s" for the first seconds of a level, and
   * a line for each hunter type met for the first time (Phase 19).
   */
  private drawLevelBanner(ctx: CanvasRenderingContext2D, time: number): void {
    const met = this.run.custom ? [] : newHunterTypes(this.run.level);
    const shown = met.length > 0 ? BANNER_TIME_NEW_HUNTER : BANNER_TIME;
    if (time > shown) return;
    const alpha = Math.min(1, (shown - time) / 0.6, time / 0.3);
    const { width, height } = this.app.viewport;
    const { hunters, rules, layout } = this.sim.state;
    const title = this.run.custom
      ? 'CUSTOM MAP'
      : this.run.daily
        ? `DAILY ${this.run.daily} · LEVEL ${this.run.level}`
        : `LEVEL ${this.run.level}`;
    drawText(ctx, title, width / 2, height * 0.3, {
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
    if (scale > 1.01 && !this.run.custom) parts.push(`MAP +${Math.round((scale - 1) * 100)}%`);
    parts.push(DIFFICULTIES[this.run.difficulty].label);
    drawText(ctx, parts.join(' · '), width / 2, height * 0.3 + 28, {
      size: 13,
      color: THEME.colors.white,
      align: 'center',
      alpha: alpha * 0.8,
    });
    // Two short lines each, so they fit a phone held upright.
    met.forEach((type, i) => {
      const y = height * 0.3 + 60 + i * 44;
      drawText(ctx, `NEW HUNTER: ${type.toUpperCase()}`, width / 2, y, {
        size: 16,
        color: THEME.colors.red,
        align: 'center',
        alpha,
      });
      drawText(ctx, HUNTER_INFO[type].short, width / 2, y + 20, {
        size: 13,
        color: THEME.colors.white,
        align: 'center',
        alpha,
      });
    });
  }

  /** A short note under the HUD, e.g. "CLOSE CALL +25". */
  private drawPopup(ctx: CanvasRenderingContext2D, time: number): void {
    if (!this.popup) return;
    const age = time - this.popup.at;
    if (age > POPUP_TIME) return;
    const alpha = Math.min(1, age / 0.1, (POPUP_TIME - age) / 0.4);
    drawText(ctx, this.popup.text, this.app.viewport.width / 2, 72 - age * 10, {
      size: 16,
      color: THEME.colors.white,
      align: 'center',
      glow: THEME.glowBlur,
      alpha,
    });
  }

  private drawTutorial(ctx: CanvasRenderingContext2D): void {
    const tutorial = this.tutorial;
    const text = tutorial?.text;
    if (!tutorial || !text) return;
    const { width, height } = this.app.viewport;
    const alpha = tutorial.opacity;
    ctx.save();
    ctx.font = `14px ${THEME.font}`;
    // Wrapped to the screen (a phone held upright is narrow, Phase 12).
    const lines = wrapLines(ctx, text, Math.min(720, width - 48));
    const w = Math.max(...lines.map((l) => ctx.measureText(l).width)) + 32;
    const boxH = lines.length * PROMPT_LINE + 12;
    // By touch the bottom of the screen belongs to the controls: prompts go up, under the HUD.
    const top = this.app.input.usingTouch ? PROMPT_TOP_TOUCH : height - 36 - boxH;
    ctx.globalAlpha = alpha * 0.7;
    ctx.fillStyle = '#000';
    ctx.fillRect(width / 2 - w / 2, top, w, boxH);
    ctx.globalAlpha = alpha * 0.6;
    ctx.strokeStyle = THEME.colors.cyan;
    ctx.strokeRect(width / 2 - w / 2 + 0.5, top + 0.5, w - 1, boxH - 1);
    ctx.restore();
    lines.forEach((line, i) => {
      drawText(ctx, line, width / 2, top + 6 + (i + 1) * PROMPT_LINE - 5, {
        size: 14,
        color: THEME.colors.white,
        align: 'center',
        alpha,
      });
    });
  }

  private finishLevel(): void {
    const { state } = this.sim;
    const score = scoreRound(roundResult(state));
    const replay = this.recorder.finish();
    if (state.status === 'extracted') {
      const seconds = this.endedAt ?? state.time;
      this.app.goTo('levelEnd', { run: this.run, score, seconds, replay });
    } else {
      this.app.goTo('gameOver', { run: this.run, score, replay });
    }
  }
}
