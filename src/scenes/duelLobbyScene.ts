import { DUEL_BOT_ORDER, DUEL_BOTS, type DuelBotId } from '@/config/duelBots';
import { GAME } from '@/config/game';
import { THEME } from '@/config/theme';
import type { InputFrame } from '@/input/inputFrame';
import { PROTOCOL_VERSION } from '@/net/protocol';
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

  constructor(app: AppContext) {
    this.app = app;
    this.bot = loadSave().duelBot;
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
      onSelect: () => this.app.goTo('duel', { practice: this.bot, seed: randomSeed() }),
    };
    switch (phase.kind) {
      case 'choose':
        this.menu = new MenuList([
          { kind: 'action', label: 'HOST A DUEL', onSelect: () => void this.host() },
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
        return;
      }
      const seed = randomSeed();
      transport.send({ t: 'hello', v: PROTOCOL_VERSION, seed });
      this.app.goTo('duel', { transport, role: 'host', seed });
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
      const seed = await waitForHello(transport);
      if (this.left) {
        transport.close();
        return;
      }
      this.app.goTo('duel', { transport, role: 'client', seed });
    } catch (error) {
      if (!this.left && this.phase.kind === 'connecting') this.fail(error);
    }
  }

  private fail(error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    this.setPhase({ kind: 'error', message });
  }
}

/** The host speaks first: its protocol version and the map seed. */
function waitForHello(transport: Transport): Promise<number> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      transport.close();
      reject(new Error('The host did not answer.'));
    }, GAME.duel.connectTimeout * 1000);
    transport.onMessage((m) => {
      if (m.t !== 'hello') return;
      clearTimeout(timer);
      if (m.v !== PROTOCOL_VERSION) {
        transport.close();
        reject(
          new Error('You are on different game versions: both players should reload the page.'),
        );
        return;
      }
      resolve(m.seed);
    });
  });
}
