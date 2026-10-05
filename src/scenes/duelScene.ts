import { AudioDirector } from '@/audio/audioDirector';
import { PracticeRival } from '@/bot/practiceRival';
import { DIFFICULTIES } from '@/config/difficulty';
import { GAME } from '@/config/game';
import { DUEL_VARIANTS, type DuelVariantId, type VariantChoice } from '@/config/duel';
import { DUEL_BOTS, type DuelBotId } from '@/config/duelBots';
import { THEME } from '@/config/theme';
import type { InputFrame } from '@/input/inputFrame';
import { toPlayerInput } from '@/input/toPlayerInput';
import type { DuelLink } from '@/net/duelLink';
import { NetSession } from '@/net/netSession';
import type { DuelSeries } from '@/net/series';
import { Camera } from '@/render/camera';
import { drawHud } from '@/render/hud';
import { drawAimGuide, playerDrawPosition } from '@/render/playerRenderer';
import { drawText } from '@/render/text';
import { WorldRenderer } from '@/render/worldRenderer';
import { ReplayRecorder } from '@/replay/recorder';
import type { Replay } from '@/replay/replay';
import { pickVariant } from '@/sim/rules';
import { createDuelSimulation, type Simulation } from '@/sim/simulation';
import { declareWinner } from '@/sim/systems/duel';
import { MenuList, type MenuItem } from '@/ui/menuList';
import { drawMenu, drawTitle } from '@/ui/menuRenderer';
import { warpToObjective } from './debugWarp';
import { RoundDisplay } from './roundDisplay';
import type { AppContext, Scene } from './scene';

/** Seconds to linger on the world after the duel is decided. */
const END_DELAY = 2;
/** Seconds the rules banner stays up. */
const BANNER_TIME = 4;
/** Seconds a cue such as "STEAL!" stays up. */
const CUE_TIME = 1.6;
/** Seconds the OVERTIME banner stays up (Phase 30). */
const OVERTIME_BANNER = 4;

/**
 * A round of an online series (Phase 27; its variant comes from the series),
 * or practice against a bot (Phase 26) with an arena variant or RANDOM.
 */
export type DuelParams =
  | { series: DuelSeries; seed: number }
  | { practice: DuelBotId; seed: number; variant?: VariantChoice };

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
  private menu: MenuList;
  private readonly role: 'host' | 'client';
  /** The bot's side of a practice duel; null online. */
  private readonly rival: PracticeRival | null;
  private readonly practice: DuelBotId | null;
  /** Practice: what was picked (one variant or RANDOM), for PLAY AGAIN. */
  private readonly practiceChoice: VariantChoice;
  private readonly variant: DuelVariantId;
  /** The online series this round belongs to; null in practice. */
  private readonly series: DuelSeries | null;
  /** The series' connection (Phase 31: it survives drops); null in practice. */
  private readonly link: DuelLink | null;
  private menuCanClaim = false;
  /** The host records the round for both players' debrief (Phase 25). */
  private readonly recorder: ReplayRecorder | null;
  private replay: Replay | null = null;
  /** The connection went on to Duel End, which closes it. */
  private handedOver = false;
  private menuOpen = false;
  private endedAt: number | null = null;
  private aimScreen: InputFrame['aim'] = null;
  /** "STEAL!" / "STOLEN!" (Phase 28) and when it appeared (sim time). */
  private cue: { text: string; color: 'green' | 'red'; at: number } | null = null;

  constructor(app: AppContext, params: DuelParams) {
    this.app = app;
    this.practice = 'practice' in params ? params.practice : null;
    this.series = 'series' in params ? params.series : null;
    this.link = this.series?.transport ?? null;
    this.practiceChoice = ('variant' in params ? params.variant : undefined) ?? 'classic';
    this.variant = this.series?.variant ?? pickVariant(this.practiceChoice, params.seed);
    this.rival = this.practice ? new PracticeRival(params.seed, this.practice, this.variant) : null;
    const transport = this.series?.transport ?? this.rival!.transport;
    this.role = this.series?.role ?? 'host';
    this.camera = new Camera(app.viewport);
    this.sim = createDuelSimulation({
      seed: params.seed,
      role: this.role,
      swapSpawns: this.series?.swapSpawns ?? false,
      variant: this.variant,
    });
    // Blackout (Phase 30) sets its own; otherwise duels keep Easy's faint explored walls.
    const ghost = this.sim.state.rules.ghostAlpha ?? DIFFICULTIES.easy.ghostAlpha;
    this.world = new WorldRenderer(this.sim, ghost);
    this.display = new RoundDisplay(this.camera, this.world);
    this.audio = new AudioDirector(this.sim, this.display.output(app.sound));
    this.net = new NetSession(this.sim, transport, this.series?.round ?? 1);
    this.recorder = this.role === 'host' ? new ReplayRecorder(this.sim, params.seed) : null;
    // The rival is gone for good (Phase 31): left, timed out, or can't play our version.
    this.net.onDisconnect(() => {
      const { state } = this.sim;
      if (state.status !== 'playing') return;
      if (this.net.versionMismatch) app.goTo('duelEnd', { outcome: 'version' });
      // The host is the referee: it wins by forfeit, and the round ends as usual.
      else if (this.role === 'host') declareWinner(this.sim, state.player.id, true);
      else app.goTo('duelEnd', { outcome: 'disconnected' });
    });
    this.sim.events.on('roundEnded', (e) => (this.endedAt = e.time));
    this.sim.events.on('duelEnded', (e) => this.series?.finishRound(e.winner));
    this.sim.events.on('trapFired', (e) => {
      const me = this.sim.state.player.id;
      if (e.victim === me) this.cue = { text: 'TRAPPED!', color: 'red', at: this.sim.state.time };
      else if (e.owner === me) {
        this.cue = { text: 'TRAP SPRUNG', color: 'green', at: this.sim.state.time };
      }
    });
    this.sim.events.on('coreStolen', (e) => {
      const mine = e.by === this.sim.state.player.id;
      const victim = e.from === this.sim.state.player.id;
      if (!mine && !victim) return;
      this.cue = {
        text: mine ? 'STEAL!' : 'STOLEN!',
        color: mine ? 'green' : 'red',
        at: this.sim.state.time,
      };
    });
    this.sim.events.on('playerHit', (e) => {
      if (e.target !== this.sim.state.player.id) return;
      const { strength, duration } = THEME.shake.hit;
      this.camera.shake(strength, duration);
    });
    this.menu = this.buildMenu();
    const who = this.practice ? `practice vs ${this.practice} bot` : this.role;
    const round = this.series ? `, round ${this.series.round}/${this.series.bestOf}` : '';
    app.debug.watch('duel', `${who}, seed ${params.seed}${round}, ${this.variant}`);
  }

  /** Practice: a hidden tab opens the menu, which pauses. Online: the rival is told (Phase 31). */
  onHidden(): void {
    if (this.rival) this.menuOpen = true;
    this.link?.setAway(true);
  }

  onShown(): void {
    this.link?.setAway(false);
  }

  /** The rival's tab has been hidden long enough to claim the win (Phase 31). */
  get canClaim(): boolean {
    const away = this.link?.rivalAway ?? null;
    return (
      away !== null && away >= GAME.duel.link.awayForfeit && this.sim.state.status === 'playing'
    );
  }

  private buildMenu(): MenuList {
    const items: MenuItem[] = [
      { kind: 'action', label: 'RESUME', onSelect: () => (this.menuOpen = false) },
    ];
    if (this.canClaim) {
      items.push({
        kind: 'action',
        label: 'CLAIM THE WIN',
        onSelect: () => {
          this.net.claimWin();
          this.menuOpen = false;
        },
      });
    }
    items.push({
      kind: 'action',
      label: this.practice ? 'LEAVE PRACTICE' : 'LEAVE DUEL',
      onSelect: () => this.app.goTo('menu'),
    });
    return new MenuList(items);
  }

  update(dt: number, input: InputFrame): void {
    if (input.back || input.pause) this.menuOpen = !this.menuOpen;
    else if (this.menuOpen) this.menu.update(input);
    if (this.app.debug.enabled && input.debugWarp) warpToObjective(this.sim.state);
    if (this.app.debug.enabled && input.debugDrop) this.link?.forceDrop();

    this.aimScreen = input.aim;
    if (this.canClaim !== this.menuCanClaim) {
      this.menuCanClaim = this.canClaim;
      this.menu = this.buildMenu();
    }
    // Online the world never pauses; with the menu open the player just stands still.
    if (this.rival && this.menuOpen) return;
    // Phase 31: while the connection is down, both sides wait, frozen, for it to come back.
    this.link?.tick(dt);
    if (this.link?.state === 'reconnecting') return;
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
        practiceVariant: this.practiceChoice,
        forfeit: state.duel?.forfeit,
        series: this.series ?? undefined,
      });
      return;
    }
    const rival = state.rival;
    this.app.debug.watch('rival', rival ? `${rival.x.toFixed(0)}, ${rival.y.toFixed(0)}` : '-');
    this.app.debug.watch('cores', `${state.player.cores} vs ${rival?.cores ?? 0}`);
  }

  exit(): void {
    // The player's side first: closing the bot's side would look like the rival leaving.
    if (!this.handedOver) {
      this.net.dispose();
      this.series?.leave();
    }
    this.rival?.dispose();
    this.audio.dispose();
  }

  /** A big, short cue under the HUD: "STEAL!" for the thief, "STOLEN!" for the one robbed. */
  private drawCue(ctx: CanvasRenderingContext2D, width: number, time: number): void {
    const cue = this.cue;
    if (!cue) return;
    const age = time - cue.at;
    if (age > CUE_TIME) return;
    const alpha = Math.min(1, age / 0.08, (CUE_TIME - age) / 0.4);
    drawText(ctx, cue.text, width / 2, 96, {
      size: 30 + 8 * Math.max(0, 1 - age / 0.2),
      color: THEME.colors[cue.color],
      align: 'center',
      glow: THEME.glowBlur * 2,
      alpha,
    });
  }

  private bannerTitle(): string {
    const variant = this.variant === 'classic' ? '' : ` · ${DUEL_VARIANTS[this.variant].label}`;
    if (this.practice) return `PRACTICE · ${DUEL_BOTS[this.practice].label} BOT${variant}`;
    const series = this.series;
    if (!series || series.bestOf === 1) return `DUEL${variant}`;
    return `ROUND ${series.round} · BEST OF ${series.bestOf}${variant}`;
  }

  /** Overtime (Phase 30): a banner when sudden death begins. */
  private drawOvertime(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    const { duel, time } = this.sim.state;
    const since = duel?.overtimeAt === null || !duel ? null : time - duel.overtimeAt;
    if (since === null || since > OVERTIME_BANNER || this.menuOpen) return;
    const a = Math.min(1, since / 0.2, (OVERTIME_BANNER - since) / 0.6);
    drawText(ctx, 'OVERTIME', width / 2, height * 0.3, {
      size: 40,
      color: THEME.colors.red,
      align: 'center',
      glow: THEME.glowBlur * 2,
      alpha: a,
    });
    drawText(
      ctx,
      'SUDDEN DEATH: carry 1 core to the beacon. Another Stalker is loose.',
      width / 2,
      height * 0.3 + 30,
      {
        size: 13,
        color: THEME.colors.white,
        align: 'center',
        alpha: a * 0.85,
      },
    );
  }

  private cornerLabel(): string {
    if (this.practice) return 'PRACTICE';
    const side = this.role === 'host' ? 'HOSTING' : 'JOINED';
    const relay = this.link?.viaRelay ? ' · VIA RELAY' : '';
    const series = this.series;
    if (!series || series.bestOf === 1) return side + relay;
    return `${side}${relay} · YOU ${series.wins(series.myId)} – ${series.wins(series.rivalId)} RIVAL`;
  }

  /** Phase 31: the round trip to the rival, orange when slow. */
  private drawPing(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    const latency = this.link?.latency;
    if (latency === null || latency === undefined || this.link?.state !== 'open') return;
    const ms = Math.round(latency * 1000);
    const slow = ms > GAME.duel.link.highPing;
    drawText(ctx, `PING ${ms} ms`, width - 12, height - 28, {
      size: 11,
      color: slow ? THEME.colors.orange : THEME.colors.white,
      align: 'right',
      alpha: slow ? 0.9 : 0.35,
    });
  }

  /** Phase 31: the connection is down (with the time left), or the rival's tab is hidden. */
  private drawConnection(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    const link = this.link;
    if (!link) return;
    let title: string | null = null;
    let line = '';
    if (link.state === 'reconnecting') {
      title = this.role === 'host' ? 'RIVAL DISCONNECTED' : 'CONNECTION LOST';
      const left = Math.ceil(link.secondsLeft);
      line =
        this.role === 'host'
          ? `Waiting for them to come back: ${left} s. The round is paused.`
          : `Reconnecting: ${left} s. The round is paused.`;
    } else if (link.rivalAway !== null && this.sim.state.status === 'playing') {
      title = 'RIVAL IS AWAY';
      const wait = Math.ceil(GAME.duel.link.awayForfeit - link.rivalAway);
      line = this.canClaim
        ? 'Their tab is hidden. You can claim the win from the menu (ESC).'
        : `Their tab is hidden. You can claim the win in ${wait} s.`;
    }
    if (!title) return;
    drawText(ctx, title, width / 2, height * 0.42, {
      size: 30,
      color: THEME.colors.orange,
      align: 'center',
      glow: THEME.glowBlur * 2,
    });
    drawText(ctx, line, width / 2, height * 0.42 + 26, {
      size: 13,
      color: THEME.colors.white,
      align: 'center',
      alpha: 0.85,
    });
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
    this.drawCue(ctx, width, state.time);
    this.drawOvertime(ctx, width, height);
    if (state.time < BANNER_TIME && !this.menuOpen) {
      const a = Math.min(1, (BANNER_TIME - state.time) / 0.6);
      const title = this.bannerTitle();
      drawText(ctx, title, width / 2, height * 0.3, {
        size: 34,
        color: THEME.colors.cyan,
        align: 'center',
        glow: THEME.glowBlur,
        alpha: a,
      });
      drawText(ctx, DUEL_VARIANTS[this.variant].blurb, width / 2, height * 0.3 + 28, {
        size: 13,
        color: THEME.colors.white,
        align: 'center',
        alpha: a * 0.8,
      });
    }
    if (!this.menuOpen) this.drawConnection(ctx, width, height);
    this.drawPing(ctx, width, height);
    const corner = this.cornerLabel();
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
