import { DUEL_VARIANTS, type VariantChoice } from '@/config/duel';
import { DUEL_BOTS, type DuelBotId } from '@/config/duelBots';
import { THEME } from '@/config/theme';
import type { InputFrame } from '@/input/inputFrame';
import type { NetSession } from '@/net/netSession';
import { VERSION_MESSAGE } from '@/net/protocol';
import type { DuelSeries } from '@/net/series';
import { randomSeed } from '@/platform/seed';
import { drawText } from '@/render/text';
import {
  addStats,
  duelStats,
  formatStat,
  STAT_ROWS,
  type DuelStatsTable,
} from '@/replay/duelStats';
import type { Replay } from '@/replay/replay';
import { MenuList, type MenuItem } from '@/ui/menuList';
import { drawMenu } from '@/ui/menuRenderer';
import type { AppContext, Scene } from './scene';

/** 'version': the rival left because the game versions differ (Phase 31). */
export type DuelOutcome = 'won' | 'lost' | 'disconnected' | 'version';

export interface DuelEndParams {
  outcome: DuelOutcome;
  /**
   * The round's connection, handed over by the duel. This screen closes it
   * when it exits, or (a series going on) detaches it for the next round.
   */
  net?: NetSession;
  /** The round's recording: the host's own, or (client) none yet: it arrives through `net`. */
  replay?: Replay;
  /** This machine's player id, so the debrief knows which path is "you". */
  viewerId?: number;
  /** The bot's level, if this was a practice duel (Phase 26). */
  practice?: DuelBotId;
  /** Practice: the variant picked (or RANDOM), for PLAY AGAIN (Phase 30). */
  practiceVariant?: VariantChoice;
  /** The online series this round belongs to (Phase 27). */
  series?: DuelSeries;
  /** Won (or lost) by forfeit: the rival left, or someone was away too long (Phase 31). */
  forfeit?: boolean;
}

/** Keys are ignored this long, so a key still held from the duel doesn't skip the screen (s). */
const INPUT_GRACE = 0.8;
const MENU_WIDTH = 280;
const STAT_ROW = 19;

/**
 * How the round ended, both players' stats, the map debrief, and where to
 * go next. In a series this is also the screen between rounds: the score,
 * READY for the next round (with a countdown once both are), REMATCH once
 * the series is over, and "Rival left" if the other player goes.
 */
export class DuelEndScene implements Scene {
  readonly name = 'DuelEnd';
  private readonly app: AppContext;
  private readonly params: DuelEndParams;
  private readonly series: DuelSeries | null;
  /** The series round that just ended. */
  private readonly round: number;
  private replay: Replay | null;
  private stats: DuelStatsTable | null = null;
  private menu: MenuList;
  /** What the menu showed when it was built (rebuilt when it changes). */
  private menuKey: string;
  /** Seconds until the next round starts, once the host has announced it. */
  private countdown: number | null = null;
  /** Leaving for the next round: the connection stays open. */
  private continuing = false;
  private time = 0;

  constructor(app: AppContext, params: DuelEndParams) {
    this.app = app;
    this.params = params;
    this.series = params.series ?? null;
    this.round = this.series?.round ?? 1;
    this.replay = null;
    if (params.replay) this.receive(params.replay);
    params.net?.onRecording((replay) => this.receive(replay));
    this.menuKey = this.currentMenuKey();
    this.menu = this.buildMenu();
  }

  /** The debrief recording, once it is here. */
  get debrief(): Replay | null {
    return this.replay;
  }

  /** This round's stats, once the recording is here. */
  get roundStats(): DuelStatsTable | null {
    return this.stats;
  }

  update(dt: number, input: InputFrame): void {
    this.time += dt;
    // Phase 31: the series' connection keeps its heartbeat (and may be reconnecting) here too.
    this.series?.transport.tick(dt);
    if (this.tickCountdown(dt)) return;
    const key = this.currentMenuKey();
    if (key !== this.menuKey) {
      this.menuKey = key;
      this.menu = this.buildMenu(this.menu.selected);
    }
    if (this.time < INPUT_GRACE) return;
    if (input.back) this.app.goTo('menu');
    else this.menu.update(input);
  }

  /** Between rounds too, a hidden tab is announced, so it isn't taken for a lost connection. */
  onHidden(): void {
    this.series?.transport.setAway(true);
  }

  onShown(): void {
    this.series?.transport.setAway(false);
  }

  exit(): void {
    const { net } = this.params;
    if (this.continuing) {
      net?.detach();
      return;
    }
    if (this.series) {
      net?.detach();
      this.series.leave();
    } else {
      net?.dispose();
    }
  }

  render(ctx: CanvasRenderingContext2D): void {
    const { width, height } = this.app.viewport;
    const cx = width / 2;
    const white = THEME.colors.white;
    let y = Math.max(70, height * 0.16);

    const head = this.heading();
    drawText(ctx, head.title, cx, y, {
      size: 40,
      color: head.color,
      align: 'center',
      glow: THEME.glowBlur * 2,
    });
    y += 34;
    drawText(ctx, head.line, cx, y, { size: 14, color: white, align: 'center', alpha: 0.7 });
    y += 24;
    const status = this.statusLine();
    if (status) {
      drawText(ctx, status, cx, y, { size: 14, color: THEME.colors.orange, align: 'center' });
    }
    y += 22;
    y = this.drawStats(ctx, cx, y);
    if (this.time >= INPUT_GRACE) {
      drawMenu(ctx, this.menu, cx, y + 24, Math.min(MENU_WIDTH, width - 32), height - 8);
    }
  }

  // ─── What happened ────────────────────────────────────────────────────────

  private receive(replay: Replay): void {
    if (this.replay) return;
    this.replay = replay;
    this.stats = duelStats(replay);
    if (this.stats) this.series?.setStats(this.round, this.stats);
  }

  private heading(): { title: string; line: string; color: string } {
    const head = this.baseHeading();
    if (this.params.forfeit && this.params.outcome === 'won') {
      head.line = 'Your rival left, or was away too long: you win by forfeit.';
    } else if (this.params.forfeit && this.params.outcome === 'lost') {
      head.line = 'You were away too long: your rival claimed the win.';
    }
    return head;
  }

  private baseHeading(): { title: string; line: string; color: string } {
    const { outcome, practice } = this.params;
    const { green, red, orange } = THEME.colors;
    if (outcome === 'version') {
      return { title: "CAN'T PLAY", line: VERSION_MESSAGE, color: orange };
    }
    if (outcome === 'disconnected') {
      return {
        title: 'CONNECTION LOST',
        line: 'Your opponent left or the connection dropped.',
        color: orange,
      };
    }
    const won = outcome === 'won';
    const color = won ? green : red;
    if (practice) {
      const bot = `${DUEL_BOTS[practice].label} bot`;
      return won
        ? { title: 'YOU WIN', line: `You extracted before the ${bot}.`, color }
        : { title: 'YOU LOSE', line: `The ${bot} extracted first.`, color };
    }
    const series = this.series;
    if (!series || series.bestOf === 1) {
      return won
        ? { title: 'YOU WIN', line: 'You extracted first.', color }
        : { title: 'YOU LOSE', line: 'Your rival extracted first.', color };
    }
    const score = `YOU ${series.wins(series.myId)} – ${series.wins(series.rivalId)} RIVAL`;
    if (series.over) {
      const champion = series.champion === series.myId;
      return {
        title: champion ? 'SERIES WON' : 'SERIES LOST',
        line: `Best of ${series.bestOf} · ${score}`,
        color: champion ? green : red,
      };
    }
    return {
      title: won ? 'ROUND WON' : 'ROUND LOST',
      line: `Round ${this.round} of best of ${series.bestOf} · ${DUEL_VARIANTS[series.variant].label} · ${score} · first to ${series.winsNeeded}`,
      color,
    };
  }

  private statusLine(): string | null {
    const series = this.series;
    if (!series || this.params.outcome === 'disconnected') return null;
    if (series.rivalLeft) return 'Rival left.';
    if (series.transport.state === 'reconnecting') {
      return `Rival disconnected: waiting ${Math.ceil(series.transport.secondsLeft)} s for them.`;
    }
    if (this.countdown !== null) {
      const next = series.upcoming;
      const variant = next ? ` · ${DUEL_VARIANTS[next.variant].label}` : '';
      return `ROUND ${next?.round ?? this.round + 1}${variant} STARTS IN ${Math.ceil(this.countdown)}`;
    }
    if (series.rivalIsReady && !series.ready) {
      return series.over ? 'Your rival wants a rematch.' : 'Your rival is ready.';
    }
    return null;
  }

  /** Both players side by side; plus the series total once a series is over. Returns the y below. */
  private drawStats(ctx: CanvasRenderingContext2D, cx: number, top: number): number {
    const white = THEME.colors.white;
    const stats = this.stats;
    if (!stats) {
      if (this.params.net && this.params.outcome !== 'disconnected') {
        const note = this.params.net.disconnected
          ? 'No stats: the recording never came.'
          : 'Stats are on their way…';
        drawText(ctx, note, cx, top + 14, { size: 12, color: white, align: 'center', alpha: 0.5 });
        return top + 30;
      }
      return top;
    }
    const me = this.params.viewerId ?? Number(Object.keys(stats)[0]);
    const rival = Number(Object.keys(stats).find((id) => Number(id) !== me));
    const series = this.series;
    const total = series && series.bestOf > 1 && series.over ? this.seriesTotal() : null;
    const them = this.params.practice ? 'BOT' : 'RIVAL';

    const columns: { title: string; table: DuelStatsTable; id: number; color: string }[] = [
      { title: 'YOU', table: stats, id: me, color: THEME.colors.cyan },
      { title: them, table: stats, id: rival, color: THEME.colors.orange },
    ];
    if (total) {
      columns.push(
        { title: 'SERIES YOU', table: total, id: me, color: THEME.colors.cyan },
        { title: `SERIES ${them}`, table: total, id: rival, color: THEME.colors.orange },
      );
    }
    const labelWidth = 150;
    const columnWidth = total ? 90 : 80;
    const left = cx - (labelWidth + columns.length * columnWidth) / 2;
    let y = top + 12;
    columns.forEach((c, i) => {
      const x = left + labelWidth + (i + 0.5) * columnWidth;
      drawText(ctx, c.title, x, y, { size: 11, color: c.color, align: 'center', alpha: 0.9 });
    });
    for (const row of STAT_ROWS) {
      y += STAT_ROW;
      drawText(ctx, row.label, left, y, { size: 12, color: white, alpha: 0.6 });
      columns.forEach((c, i) => {
        const value = c.table[c.id]?.[row.key] ?? 0;
        const x = left + labelWidth + (i + 0.5) * columnWidth;
        drawText(ctx, formatStat(row.key, value), x, y, {
          size: 13,
          color: white,
          align: 'center',
        });
      });
    }
    return y + 8;
  }

  private seriesTotal(): DuelStatsTable | null {
    const rounds = this.series?.history.filter((r) => r.stats) ?? [];
    if (rounds.length === 0) return null;
    return rounds.reduce<DuelStatsTable>((sum, r) => addStats(sum, r.stats!), {});
  }

  // ─── What next ────────────────────────────────────────────────────────────

  /** Run the countdown to the next round. Returns true once the scene has moved on. */
  private tickCountdown(dt: number): boolean {
    const series = this.series;
    // Waiting for a dropped connection: the countdown holds.
    if (series?.transport.state === 'reconnecting') return false;
    if (!series || series.rivalLeft) {
      this.countdown = null;
      return false;
    }
    const next = series.upcoming;
    if (!next) return false;
    this.countdown = (this.countdown ?? next.countdown) - dt;
    if (this.countdown > 0) return false;
    const round = series.begin()!;
    this.continuing = true;
    this.app.goTo('duel', { series, seed: round.seed });
    return true;
  }

  private currentMenuKey(): string {
    const s = this.series;
    return [
      this.mapState(),
      s?.ready,
      s?.rivalIsReady,
      s?.rivalLeft,
      this.countdown !== null,
    ].join();
  }

  private mapState(): 'none' | 'ready' | 'waiting' | 'lost' {
    if (this.replay) return 'ready';
    const { net } = this.params;
    if (!net) return 'none';
    return net.disconnected ? 'lost' : 'waiting';
  }

  private buildMenu(selected = 0): MenuList {
    const app = this.app;
    const items: MenuItem[] = [];
    const series = this.series;
    const live =
      series &&
      !series.rivalLeft &&
      this.params.outcome !== 'disconnected' &&
      this.params.outcome !== 'version';

    if (live) {
      const label = series.over ? 'REMATCH' : 'READY';
      items.push(
        series.ready || this.countdown !== null
          ? {
              kind: 'action',
              label,
              onSelect: () => {},
              disabled: true,
              note: this.countdown !== null ? 'STARTING…' : 'WAITING FOR RIVAL…',
            }
          : {
              kind: 'action',
              label,
              onSelect: () => series.markReady(),
              value: () => (series.rivalIsReady ? 'RIVAL READY' : ''),
            },
      );
    }

    // Once you're ready the next round may start at any moment, so the debrief closes.
    const busy = live && (series.ready || this.countdown !== null);
    const replay = this.replay;
    const map = this.mapState();
    if (replay && !busy) {
      const viewerId = this.params.viewerId;
      items.push({
        kind: 'action',
        label: 'MAP',
        onSelect: () => app.open('replay', { replay, viewerId }),
      });
    } else if (map !== 'none') {
      const note = busy ? 'YOU ARE READY' : map === 'lost' ? 'NOT RECEIVED' : 'RECEIVING…';
      items.push({ kind: 'action', label: 'MAP', onSelect: () => {}, disabled: true, note });
    }

    const practice = this.params.practice;
    if (practice) {
      items.push(
        {
          kind: 'action',
          label: 'PLAY AGAIN',
          onSelect: () =>
            app.goTo('duel', {
              practice,
              seed: randomSeed(),
              variant: this.params.practiceVariant,
            }),
        },
        { kind: 'action', label: 'DUEL MENU', onSelect: () => app.goTo('duelLobby') },
      );
    } else if (live && !series.over) {
      items.push({ kind: 'action', label: 'LEAVE SERIES', onSelect: () => app.goTo('duelLobby') });
    } else {
      items.push({ kind: 'action', label: 'NEW DUEL', onSelect: () => app.goTo('duelLobby') });
    }
    items.push({ kind: 'action', label: 'MAIN MENU', onSelect: () => app.goTo('menu') });
    return new MenuList(items, selected);
  }
}
