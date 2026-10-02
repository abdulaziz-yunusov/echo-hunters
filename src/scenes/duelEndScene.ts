import { THEME } from '@/config/theme';
import type { InputFrame } from '@/input/inputFrame';
import type { NetSession } from '@/net/netSession';
import { drawText } from '@/render/text';
import type { Replay } from '@/replay/replay';
import { MenuList, type MenuItem } from '@/ui/menuList';
import { drawMenu } from '@/ui/menuRenderer';
import type { AppContext, Scene } from './scene';

export type DuelOutcome = 'won' | 'lost' | 'disconnected';

export interface DuelEndParams {
  outcome: DuelOutcome;
  /** The duel's connection, handed over by the duel; this screen closes it when it exits. */
  net?: NetSession;
  /** The round's recording: the host's own, or (client) none yet: it arrives through `net`. */
  replay?: Replay;
  /** This machine's player id, so the debrief knows which path is "you". */
  viewerId?: number;
}

const TEXT: Record<DuelOutcome, { title: string; color: string; line: string }> = {
  won: { title: 'YOU WIN', color: THEME.colors.green, line: 'You extracted first.' },
  lost: { title: 'YOU LOSE', color: THEME.colors.red, line: 'Your rival extracted first.' },
  disconnected: {
    title: 'CONNECTION LOST',
    color: THEME.colors.orange,
    line: 'Your opponent left or the connection dropped.',
  },
};

/** Keys are ignored this long, so a key still held from the duel doesn't skip the screen (s). */
const INPUT_GRACE = 0.8;

/** How the duel ended, the map debrief, and where to go next. */
export class DuelEndScene implements Scene {
  readonly name = 'DuelEnd';
  private readonly app: AppContext;
  private readonly params: DuelEndParams;
  private replay: Replay | null;
  private menu: MenuList;
  /** What the MAP button showed when the menu was built (rebuilt when it changes). */
  private mapState: 'none' | 'ready' | 'waiting' | 'lost';
  private time = 0;

  constructor(app: AppContext, params: DuelEndParams) {
    this.app = app;
    this.params = params;
    this.replay = params.replay ?? null;
    params.net?.onRecording((replay) => (this.replay = replay));
    this.mapState = this.currentMapState();
    this.menu = this.buildMenu();
  }

  /** The debrief recording, once it is here. */
  get debrief(): Replay | null {
    return this.replay;
  }

  update(dt: number, input: InputFrame): void {
    this.time += dt;
    const mapState = this.currentMapState();
    if (mapState !== this.mapState) {
      this.mapState = mapState;
      this.menu = this.buildMenu(this.menu.selected);
    }
    if (this.time < INPUT_GRACE) return;
    if (input.back) this.app.goTo('menu');
    else this.menu.update(input);
  }

  exit(): void {
    this.params.net?.dispose();
  }

  render(ctx: CanvasRenderingContext2D): void {
    const { width, height } = this.app.viewport;
    const cx = width / 2;
    const cy = height / 2;
    const t = TEXT[this.params.outcome];
    drawText(ctx, t.title, cx, cy - 60, {
      size: 44,
      color: t.color,
      align: 'center',
      glow: THEME.glowBlur * 2,
    });
    drawText(ctx, t.line, cx, cy - 24, {
      size: 14,
      color: THEME.colors.white,
      align: 'center',
      alpha: 0.7,
    });
    if (this.time >= INPUT_GRACE) drawMenu(ctx, this.menu, cx, cy + 40, 260);
  }

  private currentMapState(): DuelEndScene['mapState'] {
    if (this.replay) return 'ready';
    const { net } = this.params;
    if (!net) return 'none';
    return net.disconnected ? 'lost' : 'waiting';
  }

  private buildMenu(selected = 0): MenuList {
    const app = this.app;
    const map: MenuItem[] = [];
    const replay = this.replay;
    if (replay) {
      const viewerId = this.params.viewerId;
      map.push({
        kind: 'action',
        label: 'MAP',
        onSelect: () => app.open('replay', { replay, viewerId }),
      });
    } else if (this.mapState !== 'none') {
      const note = this.mapState === 'waiting' ? 'RECEIVING…' : 'NOT RECEIVED';
      map.push({ kind: 'action', label: 'MAP', onSelect: () => {}, disabled: true, note });
    }
    return new MenuList(
      [
        ...map,
        { kind: 'action', label: 'NEW DUEL', onSelect: () => app.goTo('duelLobby') },
        { kind: 'action', label: 'MAIN MENU', onSelect: () => app.goTo('menu') },
      ],
      selected,
    );
  }
}
