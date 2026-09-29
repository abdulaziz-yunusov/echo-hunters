import { AudioDirector } from '@/audio/audioDirector';
import { DIFFICULTIES } from '@/config/difficulty';
import { THEME } from '@/config/theme';
import type { InputFrame } from '@/input/inputFrame';
import { toPlayerInput } from '@/input/toPlayerInput';
import { NetSession } from '@/net/netSession';
import type { Transport } from '@/net/transport';
import { Camera } from '@/render/camera';
import { drawHud } from '@/render/hud';
import { drawAimReticle, playerDrawPosition } from '@/render/playerRenderer';
import { drawText } from '@/render/text';
import { WorldRenderer } from '@/render/worldRenderer';
import { createDuelSimulation, type Simulation } from '@/sim/simulation';
import { MenuList } from '@/ui/menuList';
import { drawMenu, drawTitle } from '@/ui/menuRenderer';
import type { AppContext, Scene } from './scene';

/** Seconds to linger on the world after the duel is decided. */
const END_DELAY = 2;
/** Seconds the rules banner stays up. */
const BANNER_TIME = 4;

/**
 * One duel (GDD §8). Like a solo level, but the other player is out there,
 * seen only through their sounds, and the host is the referee. The game
 * cannot be paused: the menu (ESC) keeps the world running.
 */
export class DuelScene implements Scene {
  readonly name = 'Duel';
  private readonly app: AppContext;
  private readonly sim: Simulation;
  private readonly net: NetSession;
  private readonly world: WorldRenderer;
  private readonly audio: AudioDirector;
  private readonly camera: Camera;
  private readonly menu: MenuList;
  private readonly role: 'host' | 'client';
  private menuOpen = false;
  private endedAt: number | null = null;
  private aimScreen: InputFrame['aim'] = null;

  constructor(
    app: AppContext,
    params: { transport: Transport; role: 'host' | 'client'; seed: number },
  ) {
    this.app = app;
    this.role = params.role;
    this.camera = new Camera(app.viewport);
    this.sim = createDuelSimulation({ seed: params.seed, role: params.role });
    this.world = new WorldRenderer(this.sim, DIFFICULTIES.easy.ghostAlpha);
    this.audio = new AudioDirector(this.sim, app.sound);
    this.net = new NetSession(this.sim, params.transport);
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
      { kind: 'action', label: 'LEAVE DUEL', onSelect: () => app.goTo('menu') },
    ]);
    app.debug.watch('duel', `${params.role}, seed ${params.seed}`);
  }

  update(dt: number, input: InputFrame): void {
    if (input.back || input.pause) this.menuOpen = !this.menuOpen;
    else if (this.menuOpen) this.menu.update(input);

    this.aimScreen = input.aim;
    // The world never pauses in a duel; with the menu open the player just stands still.
    this.net.tick(dt);
    this.sim.step(
      toPlayerInput(input, (x, y) => this.camera.screenToWorld(x, y), this.menuOpen),
      dt,
    );
    this.world.tick(dt);
    this.audio.tick();
    this.camera.update(dt);

    const { state } = this.sim;
    if (this.endedAt !== null && state.time - this.endedAt >= END_DELAY) {
      this.app.goTo('duelEnd', { outcome: state.status === 'extracted' ? 'won' : 'lost' });
      return;
    }
    const rival = state.rival;
    this.app.debug.watch('rival', rival ? `${rival.x.toFixed(0)}, ${rival.y.toFixed(0)}` : '-');
    this.app.debug.watch('cores', `${state.player.cores} vs ${rival?.cores ?? 0}`);
  }

  exit(): void {
    this.net.dispose();
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
    if (this.aimScreen && state.player.stones > 0 && state.status === 'playing' && !this.menuOpen) {
      const aim = this.camera.screenToWorld(this.aimScreen.x, this.aimScreen.y);
      drawAimReticle(ctx, focus, aim, this.camera.pixel);
    }
    ctx.restore();

    drawHud(ctx, state);
    if (state.time < BANNER_TIME && !this.menuOpen) {
      const a = Math.min(1, (BANNER_TIME - state.time) / 0.6);
      drawText(ctx, 'DUEL', width / 2, height * 0.3, {
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
    drawText(ctx, this.role === 'host' ? 'HOSTING' : 'JOINED', width - 12, height - 12, {
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
      drawText(ctx, 'The duel keeps going while this is open.', width / 2, height * 0.32 + 28, {
        size: 12,
        color: THEME.colors.white,
        align: 'center',
        alpha: 0.6,
      });
      drawMenu(ctx, this.menu, width / 2, height * 0.32 + 80, Math.min(320, width - 32));
    }
  }
}
