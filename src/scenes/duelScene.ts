import { AudioDirector } from '@/audio/audioDirector';
import { PracticeRival } from '@/bot/practiceRival';
import { DIFFICULTIES } from '@/config/difficulty';
import { DUEL_BOTS, type DuelBotId } from '@/config/duelBots';
import { THEME } from '@/config/theme';
import type { InputFrame } from '@/input/inputFrame';
import { toPlayerInput } from '@/input/toPlayerInput';
import { NetSession } from '@/net/netSession';
import type { Transport } from '@/net/transport';
import { Camera } from '@/render/camera';
import { drawHud } from '@/render/hud';
import { drawAimGuide, playerDrawPosition } from '@/render/playerRenderer';
import { drawText } from '@/render/text';
import { WorldRenderer } from '@/render/worldRenderer';
import { ReplayRecorder } from '@/replay/recorder';
import type { Replay } from '@/replay/replay';
import { createDuelSimulation, type Simulation } from '@/sim/simulation';
import { MenuList } from '@/ui/menuList';
import { drawMenu, drawTitle } from '@/ui/menuRenderer';
import { warpToObjective } from './debugWarp';
import { RoundDisplay } from './roundDisplay';
import type { AppContext, Scene } from './scene';

/** Seconds to linger on the world after the duel is decided. */
const END_DELAY = 2;
/** Seconds the rules banner stays up. */
const BANNER_TIME = 4;

/** An online duel (one side of a real link), or practice against a bot (Phase 26). */
export type DuelParams =
  | { transport: Transport; role: 'host' | 'client'; seed: number }
  | { practice: DuelBotId; seed: number };

/**
 * One duel (GDD §8). Like a solo level, but the other player is out there,
 * seen only through their sounds, and the host is the referee. An online
 * duel cannot be paused: the menu (ESC) keeps the world running.
 *
 * Practice: this side hosts, and a bot plays the client's side on this
 * machine (PracticeRival). Nobody else is waiting, so the menu pauses.
 */
export class DuelScene implements Scene {
  readonly name = 'Duel';
  private readonly app: AppContext;
  private readonly sim: Simulation;
  private readonly net: NetSession;
  private readonly world: WorldRenderer;
  private readonly audio: AudioDirector;
  private readonly camera: Camera;
  private readonly display: RoundDisplay;
  private readonly menu: MenuList;
  private readonly role: 'host' | 'client';
  /** The bot's side of a practice duel; null online. */
  private readonly rival: PracticeRival | null;
  private readonly practice: DuelBotId | null;
  /** The host records the round for both players' debrief (Phase 25). */
  private readonly recorder: ReplayRecorder | null;
  private replay: Replay | null = null;
  /** The connection went on to Duel End, which closes it. */
  private handedOver = false;
  private menuOpen = false;
  private endedAt: number | null = null;
  private aimScreen: InputFrame['aim'] = null;

  constructor(app: AppContext, params: DuelParams) {
    this.app = app;
    this.practice = 'practice' in params ? params.practice : null;
    this.rival = this.practice ? new PracticeRival(params.seed, this.practice) : null;
    const transport = 'transport' in params ? params.transport : this.rival!.transport;
    this.role = 'role' in params ? params.role : 'host';
    this.camera = new Camera(app.viewport);
    this.sim = createDuelSimulation({ seed: params.seed, role: this.role });
    this.world = new WorldRenderer(this.sim, DIFFICULTIES.easy.ghostAlpha);
    this.display = new RoundDisplay(this.camera, this.world);
    this.audio = new AudioDirector(this.sim, this.display.output(app.sound));
    this.net = new NetSession(this.sim, transport);
    this.recorder = this.role === 'host' ? new ReplayRecorder(this.sim, params.seed) : null;
    this.net.onDisconnect(() => {
      if (this.sim.state.status === 'playing') app.goTo('duelEnd', { outcome: 'disconnected' });
    });
    this.sim.events.on('roundEnded', (e) => (this.endedAt = e.time));
    this.sim.events.on('playerHit', (e) => {
      if (e.target !== this.sim.state.player.id) return;
      const { strength, duration } = THEME.shake.hit;
      this.camera.shake(strength, duration);
    });
    this.menu = new MenuList([
      { kind: 'action', label: 'RESUME', onSelect: () => (this.menuOpen = false) },
      {
        kind: 'action',
        label: this.practice ? 'LEAVE PRACTICE' : 'LEAVE DUEL',
        onSelect: () => app.goTo('menu'),
      },
    ]);
    const who = this.practice ? `practice vs ${this.practice} bot` : this.role;
    app.debug.watch('duel', `${who}, seed ${params.seed}`);
  }

  /** Practice only: a hidden tab opens the menu, which pauses. */
  onHidden(): void {
    if (this.rival) this.menuOpen = true;
  }

  update(dt: number, input: InputFrame): void {
    if (input.back || input.pause) this.menuOpen = !this.menuOpen;
    else if (this.menuOpen) this.menu.update(input);
    if (this.app.debug.enabled && input.debugWarp) warpToObjective(this.sim.state);

    this.aimScreen = input.aim;
    // Online the world never pauses; with the menu open the player just stands still.
    if (this.rival && this.menuOpen) return;
    this.net.tick(dt);
    this.sim.step(
      toPlayerInput(input, (x, y) => this.camera.screenToWorld(x, y), this.menuOpen),
      dt,
    );
    this.recorder?.afterStep();
    this.rival?.step(dt);
    this.world.tick(dt);
    this.audio.tick();
    this.display.update(dt);
    this.camera.update(dt);

    const { state } = this.sim;
    if (this.recorder && state.status !== 'playing' && !this.replay) {
      this.replay = this.recorder.finish();
      this.net.shareRecording(this.replay);
    }
    if (this.endedAt !== null && state.time - this.endedAt >= END_DELAY) {
      this.handedOver = true;
      this.app.goTo('duelEnd', {
        outcome: state.status === 'extracted' ? 'won' : 'lost',
        net: this.net,
        replay: this.replay ?? undefined,
        viewerId: state.player.id,
        practice: this.practice ?? undefined,
      });
      return;
    }
    const rival = state.rival;
    this.app.debug.watch('rival', rival ? `${rival.x.toFixed(0)}, ${rival.y.toFixed(0)}` : '-');
    this.app.debug.watch('cores', `${state.player.cores} vs ${rival?.cores ?? 0}`);
  }

  exit(): void {
    // The player's side first: closing the bot's side would look like the rival leaving.
    if (!this.handedOver) this.net.dispose();
    this.rival?.dispose();
    this.audio.dispose();
  }

  render(ctx: CanvasRenderingContext2D, alpha: number): void {
    const { state } = this.sim;
    const { tiles } = state.layout;
    const { width, height } = this.app.viewport;

    ctx.save();
    const focus = playerDrawPosition(state.player, alpha);
    this.camera.follow(focus.x, focus.y, tiles.worldWidth, tiles.worldHeight);
    this.camera.apply(ctx);
    this.world.draw(ctx, this.camera, alpha, this.app.debug.enabled);
    if (this.aimScreen && state.status === 'playing' && !this.menuOpen) {
      const aim = this.camera.screenToWorld(this.aimScreen.x, this.aimScreen.y);
      drawAimGuide(ctx, state.player, focus, aim, this.camera.pixel);
    }
    ctx.restore();

    this.display.draw(ctx, width, height, focus);
    drawHud(ctx, state);
    if (state.time < BANNER_TIME && !this.menuOpen) {
      const a = Math.min(1, (BANNER_TIME - state.time) / 0.6);
      const title = this.practice ? `PRACTICE · ${DUEL_BOTS[this.practice].label} BOT` : 'DUEL';
      drawText(ctx, title, width / 2, height * 0.3, {
        size: 34,
        color: THEME.colors.cyan,
        align: 'center',
        glow: THEME.glowBlur,
        alpha: a,
      });
      drawText(
        ctx,
        'Carry 2 cores to the beacon first. Two hits and you drop them.',
        width / 2,
        height * 0.3 + 28,
        {
          size: 13,
          color: THEME.colors.white,
          align: 'center',
          alpha: a * 0.8,
        },
      );
    }
    const corner = this.practice ? 'PRACTICE' : this.role === 'host' ? 'HOSTING' : 'JOINED';
    drawText(ctx, corner, width - 12, height - 12, {
      size: 11,
      color: THEME.colors.white,
      align: 'right',
      alpha: 0.35,
    });

    if (this.menuOpen) {
      ctx.save();
      ctx.globalAlpha = 0.72;
      ctx.fillStyle = THEME.background;
      ctx.fillRect(0, 0, width, height);
      ctx.restore();
      drawTitle(ctx, 'DUEL MENU', width / 2, height * 0.32);
      const note = this.rival ? 'Paused.' : 'The duel keeps going while this is open.';
      drawText(ctx, note, width / 2, height * 0.32 + 28, {
        size: 12,
        color: THEME.colors.white,
        align: 'center',
        alpha: 0.6,
      });
      drawMenu(ctx, this.menu, width / 2, height * 0.32 + 80, Math.min(320, width - 32));
    }
  }
}
