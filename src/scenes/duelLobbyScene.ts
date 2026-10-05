import {
  DUEL_VARIANTS,
  VARIANT_CHOICES,
  type DuelVariantId,
  type VariantChoice,
} from '@/config/duel';
import { DUEL_BOT_ORDER, DUEL_BOTS, type DuelBotId } from '@/config/duelBots';
import { GAME } from '@/config/game';
import { THEME } from '@/config/theme';
import type { InputFrame } from '@/input/inputFrame';
import { PROTOCOL_VERSION } from '@/net/protocol';
import { DuelLink } from '@/net/duelLink';
import { VERSION_MESSAGE } from '@/net/protocol';
import { DuelSeries } from '@/net/series';
import { pickVariant } from '@/sim/rules';
import type { Transport } from '@/net/transport';
import { randomSeed } from '@/platform/seed';
import { loadSave, updateSave } from '@/platform/storage';
import { drawText } from '@/render/text';
import { MenuList } from '@/ui/menuList';
import { drawMenu, drawTitle } from '@/ui/menuRenderer';
import { TextField } from '@/ui/textField';
import { newRun } from './run';
import type { AppContext, Scene } from './scene';

type Phase =
  | { kind: 'choose' }
  | { kind: 'hosting'; code: string | null }
  | { kind: 'enterCode' }
  | { kind: 'connecting'; code: string }
  | { kind: 'error'; message: string };

const MENU_WIDTH = 320;

/**
 * Set up a 1v1 duel (GDD §8): host a room and share its code, or join one
 * by code. PeerJS is loaded only here, so solo play never touches the network.
 * Or practice offline against a bot, at the level picked here (Phase 26).
 * The host picks the series length (best of 1 / 3 / 5); the joiner learns it
 * from `hello` and sees it on the first round's banner.
 */
export class DuelLobbyScene implements Scene {
  readonly name = 'DuelLobby';
  private readonly app: AppContext;
  private phase: Phase = { kind: 'choose' };
  private menu!: MenuList;
  private field: TextField | null = null;
  private cancelHosting: (() => void) | null = null;
  /** Set once the scene is left, so late network answers are ignored. */
  private left = false;
  private bot: DuelBotId;
  private bestOf: number;
  /** Arena variant for hosted duels and practice (Phase 30): one, or RANDOM. */
  private variant: VariantChoice;

  constructor(app: AppContext) {
    this.app = app;
    const save = loadSave();
    this.bot = save.duelBot;
    this.bestOf = save.duelBestOf;
    this.variant = save.duelVariant;
    this.setPhase({ kind: 'choose' });
  }

  update(_dt: number, input: InputFrame): void {
    if (input.back) {
      this.goBack();
      return;
    }
    this.menu.update(input);
  }

  exit(): void {
    this.left = true;
    this.cancelHosting?.();
    this.field?.remove();
  }

  render(ctx: CanvasRenderingContext2D): void {
    const { width, height } = this.app.viewport;
    const cx = width / 2;
    const top = height * 0.2;
    const white = THEME.colors.white;
    drawTitle(ctx, 'DUEL IN THE DARK', cx, top);
    drawText(ctx, 'Two players, one maze. Carry 2 cores to the beacon first.', cx, top + 30, {
      size: 12,
      color: white,
      align: 'center',
      alpha: 0.6,
    });

    let y = top + 60;
    // `y` is the top of the next line; each line is as tall as its text.
    const say = (text: string, color: string = white, size = 15) => {
      drawText(ctx, text, cx, y + size, { size, color, align: 'center' });
      y += size + 14;
    };
    const p = this.phase;
    if (p.kind === 'hosting') {
      if (p.code) {
        say('ROOM CODE', white, 13);
        say(p.code, THEME.colors.cyan, 44);
        say(`${seriesLabel(this.bestOf)} · ${variantLabel(this.variant)}`, white, 13);
        say('Send this code to your opponent. Waiting for them to join…', white, 13);
      } else {
        say('Opening a room…', white, 14);
      }
    } else if (p.kind === 'enterCode') {
      say('Type the room code:', white, 14);
      this.field?.setTop(y - 6);
      y += 60;
    } else if (p.kind === 'connecting') {
      say(`Connecting to ${p.code}…`, white, 14);
    } else if (p.kind === 'error') {
      say(p.message, THEME.colors.red, 14);
    }
    drawMenu(ctx, this.menu, cx, Math.max(y + 20, height * 0.55), Math.min(MENU_WIDTH, width - 32));
  }

  private setPhase(phase: Phase): void {
    this.phase = phase;
    if (phase.kind !== 'enterCode') {
      this.field?.remove();
      this.field = null;
    }
    const back = { kind: 'action' as const, label: 'BACK', onSelect: () => this.goBack() };
    const practice = {
      kind: 'action' as const,
      label: 'PRACTICE VS BOT',
      onSelect: () =>
        this.app.goTo('duel', { practice: this.bot, seed: randomSeed(), variant: this.variant }),
    };
    switch (phase.kind) {
      case 'choose':
        this.menu = new MenuList([
          { kind: 'action', label: 'HOST A DUEL', onSelect: () => void this.host() },
          {
            kind: 'adjust',
            label: 'SERIES',
            value: () => seriesLabel(this.bestOf),
            onChange: (step) => this.cycleBestOf(step),
          },
          {
            kind: 'adjust',
            label: 'VARIANT',
            value: () => variantLabel(this.variant),
            onChange: (step) => this.cycleVariant(step),
          },
          {
            kind: 'action',
            label: 'JOIN A DUEL',
            onSelect: () => this.setPhase({ kind: 'enterCode' }),
          },
          practice,
          {
            kind: 'adjust',
            label: 'BOT',
            value: () => DUEL_BOTS[this.bot].label,
            onChange: (step) => this.cycleBot(step),
          },
          back,
        ]);
        break;
      case 'hosting':
      case 'connecting':
        this.menu = new MenuList([
          { kind: 'action', label: 'CANCEL', onSelect: () => this.goBack() },
        ]);
        break;
      case 'enterCode':
        this.field ??= new TextField({
          placeholder: 'CODE',
          maxLength: GAME.duel.codeLength,
          onEnter: () => void this.join(),
        });
        this.menu = new MenuList([
          { kind: 'action', label: 'CONNECT', onSelect: () => void this.join() },
          back,
        ]);
        break;
      case 'error':
        this.menu = new MenuList([
          {
            kind: 'action',
            label: 'PLAY SOLO INSTEAD',
            onSelect: () =>
              this.app.goTo('play', { run: newRun(randomSeed(), loadSave().difficulty) }),
          },
          practice,
          back,
        ]);
        break;
    }
  }

  private goBack(): void {
    if (this.phase.kind === 'choose') {
      this.app.goTo('menu');
      return;
    }
    this.cancelHosting?.();
    this.cancelHosting = null;
    this.setPhase({ kind: 'choose' });
  }

  private cycleBestOf(step: number): void {
    const options = GAME.duel.series.bestOf;
    const n = options.length;
    this.bestOf = options[(options.indexOf(this.bestOf) + step + n) % n];
    updateSave({ duelBestOf: this.bestOf });
  }

  private cycleVariant(step: number): void {
    const n = VARIANT_CHOICES.length;
    this.variant = VARIANT_CHOICES[(VARIANT_CHOICES.indexOf(this.variant) + step + n) % n];
    updateSave({ duelVariant: this.variant });
  }

  private cycleBot(step: number): void {
    const n = DUEL_BOT_ORDER.length;
    this.bot = DUEL_BOT_ORDER[(DUEL_BOT_ORDER.indexOf(this.bot) + step + n) % n];
    updateSave({ duelBot: this.bot });
  }

  private async host(): Promise<void> {
    this.setPhase({ kind: 'hosting', code: null });
    try {
      const { hostRoom } = await import('@/net/peerTransport');
      const room = await hostRoom();
      if (this.left || this.phase.kind !== 'hosting') {
        room.cancel();
        return;
      }
      this.cancelHosting = room.cancel;
      this.setPhase({ kind: 'hosting', code: room.code });
      // Exposed for automated checks, like data-scene.
      document.documentElement.dataset.room = room.code;
      const transport = await room.opponent;
      this.cancelHosting = null;
      if (this.left) {
        transport.close();
        room.cancel();
        return;
      }
      const seed = randomSeed();
      const variant = pickVariant(this.variant, seed);
      // A secret for this duel: a rival who drops can prove it's them when rejoining (Phase 31).
      const token = randomSeed().toString(36);
      transport.send({
        t: 'hello',
        v: PROTOCOL_VERSION,
        seed,
        bestOf: this.bestOf,
        variant,
        token,
      });
      // The room stays open for a rejoin; it closes with the link.
      const link = new DuelLink(transport, { role: 'host', token, onClosed: () => room.cancel() });
      room.onLaterOpponent((t) => link.offer(t));
      const series = new DuelSeries(link, 'host', this.bestOf, randomSeed, {
        choice: this.variant,
        first: variant,
      });
      this.app.goTo('duel', { series, seed });
    } catch (error) {
      if (!this.left && this.phase.kind === 'hosting') this.fail(error);
    }
  }

  private async join(): Promise<void> {
    const code = this.field?.value ?? '';
    if (code.length !== GAME.duel.codeLength) return;
    this.setPhase({ kind: 'connecting', code });
    try {
      const { joinRoom } = await import('@/net/peerTransport');
      const transport = await joinRoom(code);
      if (this.left || this.phase.kind !== 'connecting') {
        transport.close();
        return;
      }
      const { seed, bestOf, variant, token } = await waitForHello(transport);
      if (this.left) {
        transport.close();
        return;
      }
      // After a drop, keep joining the same room until the host takes us back (Phase 31).
      const link = new DuelLink(transport, {
        role: 'client',
        token,
        reconnect: () => joinRoom(code),
      });
      const series = new DuelSeries(link, 'client', bestOf, randomSeed, {
        choice: variant,
        first: variant,
      });
      this.app.goTo('duel', { series, seed });
    } catch (error) {
      if (!this.left && this.phase.kind === 'connecting') this.fail(error);
    }
  }

  private fail(error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    this.setPhase({ kind: 'error', message });
  }
}

function seriesLabel(bestOf: number): string {
  return bestOf === 1 ? 'ONE ROUND' : `BEST OF ${bestOf}`;
}

/** The host speaks first: its protocol version, the first map seed and the series length. */
function variantLabel(choice: VariantChoice): string {
  return choice === 'random' ? 'RANDOM' : DUEL_VARIANTS[choice].label;
}

function waitForHello(
  transport: Transport,
): Promise<{ seed: number; bestOf: number; variant: DuelVariantId; token: string }> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      transport.close();
      reject(new Error('The host did not answer.'));
    }, GAME.duel.connectTimeout * 1000);
    transport.onMessage((m) => {
      if (m.t !== 'hello') return;
      clearTimeout(timer);
      if (m.v !== PROTOCOL_VERSION) {
        // Tell the host why we're leaving, so it can say so too.
        transport.send({ t: 'bye', reason: 'version' });
        transport.close();
        reject(new Error(VERSION_MESSAGE));
        return;
      }
      resolve({ seed: m.seed, bestOf: m.bestOf, variant: m.variant, token: m.token });
    });
  });
}
