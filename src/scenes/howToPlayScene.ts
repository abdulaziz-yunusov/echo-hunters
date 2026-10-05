import { DUEL_VARIANT_ORDER, DUEL_VARIANTS } from '@/config/duel';
import { GAME } from '@/config/game';
import { TOOLS } from '@/config/pickups';
import type { Action } from '@/config/input';
import { THEME } from '@/config/theme';
import { inputLabel, withOverrides } from '@/input/bindings';
import type { InputFrame } from '@/input/inputFrame';
import { loadSave } from '@/platform/storage';
import { drawHunterShape } from '@/render/hunterRenderer';
import { drawText } from '@/render/text';
import { firstLevelWith } from '@/sim/level';
import { HUNTER_INFO, HUNTER_ORDER } from '@/ui/hunterInfo';
import { MenuList } from '@/ui/menuList';
import { drawMenu, drawTitle } from '@/ui/menuRenderer';
import type { AppContext, Scene } from './scene';

const TIPS = [
  'Sneaking is silent. Walking leaves footsteps; hitting a wall is loud.',
  "Metal grates ring out under every step (a hunter's too); moss muffles yours.",
  'Hold ping to charge a beam: it sees far ahead, and hunters ahead hear it far too.',
  'A stone lands with a fake ping: hunters go there, not to you.',
  'While a vent roars or a pipe drips, footsteps near it are lost in the noise.',
  'Let a hunter pass close without being hit: CLOSE CALL, bonus points.',
  'The drone rises when a hunter is near. Headphones help: steps come from their side.',
  'After each level, pick 1 of 3 upgrades. It stays for the rest of the run.',
  "DAILY RUN: today's run is the same for everyone. MAP EDITOR: build a maze, share it as a link.",
];

const { duel } = GAME;

/** The duel page (Phase 27): [heading, lines]. */
const DUEL_RULES: readonly [string, readonly string[]][] = [
  [
    'GOAL',
    [
      `Two players, one maze, and a Stalker that hunts you both. Carry ${duel.coresToWin} cores to the beacon first.`,
      `The beacon wakes when someone carries enough cores. Extracting takes ${duel.extractTime} s standing there:`,
      'the beacon pulses faster, and a hit or a step away starts it over.',
      'You see your rival only when your rings pass over them; you hear their steps, pings and stones.',
    ],
  ],
  [
    'DROPS AND STEALS',
    [
      `${duel.hitsToDropCores} hits (your rival's shockwave or a hunter) and you drop every core you carry.`,
      `You must wait ${duel.dropLockSeconds} s to take your own cores back; whoever hit you can take them at once.`,
      'Picking up cores your rival dropped is a steal. A lead is never safe.',
      `Carried cores hum every ${duel.carryHumInterval} s, even when you sneak. Only a running vent or pipe hides it.`,
    ],
  ],
  [
    'SERIES',
    [
      `The host picks one round or best of ${duel.series.bestOf.filter((n) => n > 1).join(' / ')}. Spawn corners swap every round.`,
      `Both press READY between rounds (${duel.series.countdown} s countdown). REMATCH starts a new series, same room.`,
    ],
  ],
  [
    'TOOLS (ONE AT A TIME; USE: R, SEE CONTROLS)',
    [
      `TRAP KIT: set it at your feet, unseen. Your rival stepping on it snaps loudly and shows them to you.`,
      `FLARE: see your rival through walls for ${TOOLS.flare.revealSeconds} s. They hear it, and know they are seen.`,
      `DECOY STEPS: fake footsteps walk off toward your aim for ${TOOLS.decoySteps.seconds} s; yours go silent.`,
    ],
  ],
  [
    'PRACTICE',
    ['DUEL → PRACTICE VS BOT: the same duel offline, against an EASY, NORMAL or HARD bot.'],
  ],
];

/** The variants page (Phase 30): one line per arena variant, from DUEL_VARIANTS, then overtime. */
const VARIANT_RULES: readonly [string, readonly string[]][] = [
  [
    'ARENA VARIANTS (THE HOST PICKS ONE, OR RANDOM: A NEW ONE EACH ROUND)',
    DUEL_VARIANT_ORDER.map((v) => `${DUEL_VARIANTS[v].label}: ${DUEL_VARIANTS[v].blurb}`),
  ],
  [
    'OVERTIME',
    [
      `Nobody out after ${GAME.duel.overtime.at / 60} minutes? Sudden death: ${GAME.duel.overtime.coresToWin} core is enough,`,
      'loose cores hum twice as often, and one more Stalker wakes at the beacon.',
    ],
  ],
];

type Page = 'solo' | 'hunters' | 'duel' | 'variants';
const PAGES: readonly Page[] = ['solo', 'hunters', 'duel', 'variants'];
const PAGE_LABELS: Record<Page, { title: string; button: string }> = {
  solo: { title: 'HOW TO PLAY', button: 'SOLO RULES' },
  hunters: { title: 'HUNTERS', button: 'HUNTERS' },
  duel: { title: 'DUEL IN THE DARK', button: 'DUEL RULES' },
  variants: { title: 'DUEL VARIANTS', button: 'DUEL VARIANTS' },
};

/** Rules, controls (as currently bound) and a few tips; the hunters; then the duel pages. */
export class HowToPlayScene implements Scene {
  readonly name = 'HowToPlay';
  private readonly app: AppContext;
  private menu!: MenuList;
  private readonly keys: (action: Action) => string;
  private page: Page = 'solo';

  constructor(app: AppContext) {
    this.app = app;
    const bindings = withOverrides(loadSave().bindings);
    this.keys = (action) => bindings[action].map(inputLabel).join('/');
    this.buildMenu();
  }

  private buildMenu(): void {
    const other = PAGES[(PAGES.indexOf(this.page) + 1) % PAGES.length];
    this.menu = new MenuList([
      {
        kind: 'action',
        label: `${PAGE_LABELS[other].button} ▸`,
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

    drawTitle(ctx, PAGE_LABELS[this.page].title, cx, y);
    y += 40;
    const line = (text: string, color: string = white, alpha = 0.85, size = 13) => {
      drawText(ctx, text, left, y, { size, color, alpha });
      y += size + 9;
    };
    if (this.page === 'hunters') {
      this.drawHunters(ctx, left, y);
      return;
    }
    if (this.page !== 'solo') {
      for (const [heading, lines] of this.page === 'duel' ? DUEL_RULES : VARIANT_RULES) {
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
    line('Touch: left stick (a light push sneaks) · PING (hold: beam) · STONE · SHOCK · II pause');
    y += 8;
    line('Hunters are blind: they find you by sound and by touch. See HUNTERS.', white, 0.85);
    y += 8;
    line('TIPS', THEME.colors.cyan, 1, 14);
    for (const tip of TIPS) line(`· ${tip}`, white, 0.7, 12);

    drawMenu(ctx, this.menu, cx, Math.min(height - 70, y + 30), 220);
  }

  /** Every hunter type, in the order they are met (Phase 19): silhouette, name, first level, what it does. */
  private drawHunters(ctx: CanvasRenderingContext2D, left: number, top: number): void {
    const { width, height } = this.app.viewport;
    let y = top;
    for (const type of HUNTER_ORDER) {
      drawHunterShape(ctx, left + 14, y + 4, type, 0.8);
      drawText(ctx, type.toUpperCase(), left + 40, y, { size: 13, color: THEME.colors.red });
      const from = firstLevelWith(type);
      if (from !== null) {
        drawText(ctx, `LEVEL ${from}+`, left + 40, y + 16, {
          size: 10,
          color: THEME.colors.white,
          alpha: 0.5,
        });
      }
      HUNTER_INFO[type].lines.forEach((text, i) =>
        drawText(ctx, text ?? '', left + 130, y + i * 17, {
          size: 13,
          color: THEME.colors.white,
          alpha: 0.85,
        }),
      );
      y += 46;
    }
    drawMenu(ctx, this.menu, width / 2, Math.min(height - 70, y + 24), 220);
  }
}
