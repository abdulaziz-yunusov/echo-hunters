import { GAME } from '@/config/game';
import type { HunterTypeId } from '@/config/hunters';
import type { Action } from '@/config/input';
import { THEME } from '@/config/theme';
import { inputLabel, withOverrides } from '@/input/bindings';
import type { InputFrame } from '@/input/inputFrame';
import { loadSave } from '@/platform/storage';
import { drawHunterShape } from '@/render/hunterRenderer';
import { drawText } from '@/render/text';
import { MenuList } from '@/ui/menuList';
import { drawMenu, drawTitle } from '@/ui/menuRenderer';
import type { AppContext, Scene } from './scene';

const HUNTERS: readonly [HunterTypeId, string][] = [
  ['stalker', 'Slow. Walks to any sound it hears, then searches the spot.'],
  ['sprinter', 'Faster than you. Reacts only to pings, stones and shockwaves.'],
  ['listener', 'Never moves. Screams when it hears you, calling the others.'],
];

const TIPS = [
  'Sneaking is silent. Walking leaves footsteps; hitting a wall is loud.',
  "Metal grates ring out under every step (a hunter's too); moss muffles yours.",
  'Hold ping to charge a beam: it sees far ahead, and hunters ahead hear it far too.',
  'A stone lands with a fake ping: hunters go there, not to you.',
  'While a vent roars or a pipe drips, footsteps near it are lost in the noise.',
  'Let a hunter pass close without being hit: CLOSE CALL, bonus points.',
  'The drone rises when a hunter is near. Headphones help: steps come from their side.',
];

const { duel } = GAME;

/** The duel page (Phase 27): [heading, lines]. */
const DUEL_RULES: readonly [string, readonly string[]][] = [
  [
    'GOAL',
    [
      `Two players, one maze, and a Stalker that hunts you both. Carry ${duel.coresToWin} cores to the beacon first.`,
      'The beacon wakes as soon as someone carries enough cores: everyone hears it.',
      'You see your rival only when your rings pass over them; you hear their steps, pings and stones.',
    ],
  ],
  [
    'DROPS AND STEALS',
    [
      `${duel.hitsToDropCores} hits (your rival's shockwave or a hunter) and you drop every core you carry.`,
      `You must wait ${duel.dropLockSeconds} s to take your own cores back; whoever hit you can take them at once.`,
      'Picking up cores your rival dropped is a steal. A lead is never safe.',
    ],
  ],
  [
    'SERIES',
    [
      `The host picks one round or best of ${duel.series.bestOf.filter((n) => n > 1).join(' / ')}. Spawn corners swap every round.`,
      `Both press READY between rounds (${duel.series.countdown} s countdown). REMATCH starts a new series, same room.`,
      'Duel End shows both players side by side: cores, steals, hits, pings, stones, distance, time in the lead.',
    ],
  ],
  [
    'PRACTICE',
    ['DUEL → PRACTICE VS BOT: the same duel offline, against an EASY, NORMAL or HARD bot.'],
  ],
];

/** Rules, controls (as currently bound), the three hunters, and a few tips; a second page for duels. */
export class HowToPlayScene implements Scene {
  readonly name = 'HowToPlay';
  private readonly app: AppContext;
  private menu!: MenuList;
  private readonly keys: (action: Action) => string;
  private page: 'solo' | 'duel' = 'solo';

  constructor(app: AppContext) {
    this.app = app;
    const bindings = withOverrides(loadSave().bindings);
    this.keys = (action) => bindings[action].map(inputLabel).join('/');
    this.buildMenu();
  }

  private buildMenu(): void {
    const other = this.page === 'solo' ? 'duel' : 'solo';
    this.menu = new MenuList([
      {
        kind: 'action',
        label: other === 'duel' ? 'DUEL RULES' : 'SOLO RULES',
        onSelect: () => {
          this.page = other;
          this.buildMenu();
        },
      },
      { kind: 'action', label: 'BACK', onSelect: () => this.app.close() },
    ]);
  }

  update(_dt: number, input: InputFrame): void {
    if (input.back || input.pause) {
      this.app.close();
      return;
    }
    this.menu.update(input);
  }

  render(ctx: CanvasRenderingContext2D): void {
    const { width, height } = this.app.viewport;
    ctx.fillStyle = THEME.background;
    ctx.fillRect(0, 0, width, height);
    const cx = width / 2;
    const left = Math.max(16, cx - 300);
    const white = THEME.colors.white;
    const k = this.keys;
    let y = Math.max(56, height * 0.09);

    drawTitle(ctx, this.page === 'solo' ? 'HOW TO PLAY' : 'DUEL IN THE DARK', cx, y);
    y += 40;
    const line = (text: string, color: string = white, alpha = 0.85, size = 13) => {
      drawText(ctx, text, left, y, { size, color, alpha });
      y += size + 9;
    };
    if (this.page === 'duel') {
      for (const [heading, lines] of DUEL_RULES) {
        line(heading, THEME.colors.cyan, 1, 14);
        for (const text of lines) line(text);
        y += 8;
      }
      drawMenu(ctx, this.menu, cx, Math.min(height - 70, y + 30), 220);
      return;
    }

    line('It is pitch dark. You only see what sound touches.', THEME.colors.cyan, 1, 14);
    line('Find the 3 Signal Cores, then reach the Extraction Beacon.');
    y += 8;
    line('CONTROLS', THEME.colors.cyan, 1, 14);
    line(
      `Move ${k('moveUp')} ${k('moveLeft')} ${k('moveDown')} ${k('moveRight')}   ·   Sneak ${k('sneak')}`,
    );
    line(
      `Ping ${k('ping')} (hold: beam)   ·   Stone ${k('throwStone')} (aim with mouse)   ·   Shockwave ${k('shockwave')}`,
    );
    line('Pause ESC   ·   Mute M');
    y += 8;
    line('HUNTERS', THEME.colors.cyan, 1, 14);
    for (const [type, text] of HUNTERS) {
      drawHunterShape(ctx, left + 14, y - 5, type, 0.8);
      drawText(ctx, type.toUpperCase(), left + 40, y, { size: 13, color: THEME.colors.red });
      drawText(ctx, text, left + 130, y, { size: 13, color: white, alpha: 0.85 });
      y += 30;
    }
    y += 4;
    line('TIPS', THEME.colors.cyan, 1, 14);
    for (const tip of TIPS) line(`· ${tip}`, white, 0.7, 12);

    drawMenu(ctx, this.menu, cx, Math.min(height - 70, y + 30), 220);
  }
}
