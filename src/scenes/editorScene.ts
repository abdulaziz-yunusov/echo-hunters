import { loadSave } from '@/platform/storage';
import { CELLS, EDITOR, EDITOR_TOOLS, type CellCode } from '@/config/editor';
import { GAME } from '@/config/game';
import { THEME } from '@/config/theme';
import type { InputFrame } from '@/input/inputFrame';
import { copyText } from '@/platform/clipboard';
import { randomSeed } from '@/platform/seed';
import { mapLink } from '@/platform/shareLink';
import { drawText } from '@/render/text';
import {
  cellId,
  decodeMap,
  emptyMap,
  encodeMap,
  mapFromLayout,
  mapProblems,
  type CustomMap,
} from '@/sim/world/customMap';
import { isTerrain, MapEditing } from '@/sim/world/mapEditing';
import { generateMap, mapOptionsFromConfig } from '@/sim/world/mapGen';
import { chipAt, chipsBottom, drawChip, flowChips, type Chip } from '@/ui/chips';
import { newRun } from './run';
import type { AppContext, Scene } from './scene';

const MARGIN = 12;
const TOOL_WIDTH = 74;
const ACTION_WIDTH = 104;
/** Seconds a status note ("Link copied") stays. */
const NOTE_TIME = 3;

type ActionId = 'play' | 'share' | 'undo' | 'size' | 'empty' | 'random' | 'back';

/**
 * The map editor (Phase 13): paint a maze and its contents on a grid,
 * test-play it, and share it as a link (`#map=…`, no server needed).
 * Terrain is painted by dragging; markers go down one tap at a time; the
 * start and beacon move rather than multiply. Mouse, keyboard (left/right
 * picks a tool) and touch all work.
 */
export class EditorScene implements Scene {
  readonly name = 'Editor';
  private readonly app: AppContext;
  private readonly editing: MapEditing;
  private tool = 0;
  private size: number = EDITOR.defaultSize;
  private problems: string[] = [];
  private note: { text: string; at: number } | null = null;
  private time = 0;
  /** Painting with the click held down (one undo step per stroke). */
  private stroke = false;
  private hover: { tx: number; ty: number } | null = null;
  // Layout, worked out each frame in render() and used by the next update().
  private toolChips: Chip[] = [];
  private actionChips: Chip[] = [];
  private grid = { x: 0, y: 0, cell: 1 };

  constructor(app: AppContext, params: { map?: string }) {
    this.app = app;
    const shared = params.map ? decodeMap(params.map) : null;
    this.editing = new MapEditing(shared ?? EditorScene.randomMap(EDITOR.defaultSize));
    const size = shared ? EDITOR.sizes.findIndex((s) => s.width === shared.width) : -1;
    if (size >= 0) this.size = size;
    this.check();
  }

  /** The map being edited, as text. */
  get encoded(): string {
    return encodeMap(this.editing.map);
  }

  get playable(): boolean {
    return this.problems.length === 0;
  }

  update(dt: number, input: InputFrame): void {
    this.time += dt;
    if (input.back) {
      this.app.goTo('menu');
      return;
    }
    if (input.navX !== 0) {
      const n = EDITOR_TOOLS.length;
      this.tool = (this.tool + input.navX + n) % n;
    }
    const aim = input.aim;
    this.hover = aim ? this.cellAt(aim.x, aim.y) : null;
    if (input.click && aim) {
      const tool = chipAt(this.toolChips, aim.x, aim.y);
      const action = chipAt(this.actionChips, aim.x, aim.y);
      if (tool >= 0) this.tool = tool;
      else if (action >= 0) this.act(ACTIONS[action].id);
      else if (this.hover) {
        this.editing.beginStroke();
        this.stroke = true;
        this.paintAt(this.hover);
      }
    } else if (input.clickHeld && this.stroke && this.hover && isTerrain(this.code)) {
      this.paintAt(this.hover);
    }
    if (!input.clickHeld) this.stroke = false;
  }

  render(ctx: CanvasRenderingContext2D): void {
    const { width, height } = this.app.viewport;
    const white = THEME.colors.white;
    ctx.fillStyle = THEME.background;
    ctx.fillRect(0, 0, width, height);

    // Palette on top, actions at the bottom, the map in between.
    this.toolChips = flowChips(
      EDITOR_TOOLS.map(() => TOOL_WIDTH),
      MARGIN,
      MARGIN + 18,
      width - 2 * MARGIN,
    );
    drawText(ctx, 'MAP EDITOR', MARGIN, MARGIN + 10, { size: 13, color: THEME.colors.cyan });
    EDITOR_TOOLS.forEach((t, i) =>
      drawChip(ctx, this.toolChips[i], t.label, {
        color: THEME.colors[t.color],
        selected: i === this.tool,
      }),
    );
    const actionsHeight = chipsBottom(
      flowChips(
        ACTIONS.map(() => ACTION_WIDTH),
        0,
        0,
        width - 2 * MARGIN,
      ),
    );
    this.actionChips = flowChips(
      ACTIONS.map(() => ACTION_WIDTH),
      MARGIN,
      height - MARGIN - actionsHeight,
      width - 2 * MARGIN,
    );
    ACTIONS.forEach((a, i) =>
      drawChip(ctx, this.actionChips[i], this.actionLabel(a.id), {
        color: a.id === 'play' && this.playable ? THEME.colors.green : white,
        disabled: (a.id === 'play' && !this.playable) || (a.id === 'undo' && !this.editing.canUndo),
      }),
    );

    const top = chipsBottom(this.toolChips) + 10;
    const bottom = height - MARGIN - actionsHeight - 30;
    this.drawGrid(ctx, MARGIN, top, width - 2 * MARGIN, bottom - top);

    // What's missing, or ready; and the latest note.
    const status = this.note && this.time - this.note.at < NOTE_TIME ? this.note.text : null;
    const line = status ?? (this.playable ? 'Ready: TEST PLAY or SHARE it.' : this.problems[0]);
    drawText(ctx, line, width / 2, bottom + 18, {
      size: 12,
      color: status ? THEME.colors.cyan : this.playable ? THEME.colors.green : THEME.colors.orange,
      align: 'center',
    });
  }

  // ─── Editing ──────────────────────────────────────────────────────────────

  private get code(): CellCode {
    return CELLS[EDITOR_TOOLS[this.tool].cell];
  }

  private paintAt(at: { tx: number; ty: number }): void {
    if (this.editing.paint(at.tx, at.ty, this.code)) this.check();
  }

  private check(): void {
    this.problems = mapProblems(this.editing.map);
  }

  private say(text: string): void {
    this.note = { text, at: this.time };
  }

  private act(id: ActionId): void {
    const { width, height } = EDITOR.sizes[this.size];
    switch (id) {
      case 'play':
        if (!this.playable) return;
        this.app.goTo('play', {
          run: newRun(randomSeed(), loadSave().difficulty, { custom: this.encoded }),
        });
        return;
      case 'share': {
        const link = mapLink(this.encoded);
        // The address bar shows it too, so it can be copied by hand if the clipboard says no.
        try {
          history.replaceState(null, '', link);
        } catch {
          // Not in a browser (tests).
        }
        void copyText(link).then((ok) =>
          this.say(ok ? 'Link copied: send it to anyone.' : 'Copy the link from the address bar.'),
        );
        return;
      }
      case 'undo':
        this.editing.undo();
        this.check();
        return;
      case 'size':
        this.size = (this.size + 1) % EDITOR.sizes.length;
        this.say(`Next new map: ${EDITOR.sizes[this.size].label} (${width}×${height} now).`);
        return;
      case 'empty':
        this.editing.replace(emptyMap(width, height));
        this.check();
        return;
      case 'random':
        this.editing.replace(EditorScene.randomMap(this.size));
        this.check();
        return;
      case 'back':
        this.app.goTo('menu');
        return;
    }
  }

  private actionLabel(id: ActionId): string {
    const a = ACTIONS.find((x) => x.id === id)!;
    return id === 'size' ? `SIZE ${EDITOR.sizes[this.size].label}` : a.label;
  }

  /** A generated level of this size, ready to edit. */
  private static randomMap(size: number): CustomMap {
    const { width, height } = EDITOR.sizes[size];
    const scale = (width - 1) / 2 / GAME.map.cellsX;
    try {
      return mapFromLayout(generateMap(mapOptionsFromConfig(randomSeed(), { scale })));
    } catch {
      return emptyMap(width, height);
    }
  }

  // ─── The grid ─────────────────────────────────────────────────────────────

  private cellAt(x: number, y: number): { tx: number; ty: number } | null {
    const { map } = this.editing;
    const tx = Math.floor((x - this.grid.x) / this.grid.cell);
    const ty = Math.floor((y - this.grid.y) / this.grid.cell);
    if (tx < 0 || ty < 0 || tx >= map.width || ty >= map.height) return null;
    return { tx, ty };
  }

  private drawGrid(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
    const { map } = this.editing;
    const cell = Math.max(2, Math.floor(Math.min(w / map.width, h / map.height)));
    const gx = Math.round(x + (w - cell * map.width) / 2);
    const gy = Math.round(y + (h - cell * map.height) / 2);
    this.grid = { x: gx, y: gy, cell };
    const colors = THEME.colors;
    ctx.save();
    map.cells.forEach((code, i) => {
      const cx = gx + (i % map.width) * cell;
      const cy = gy + Math.floor(i / map.width) * cell;
      const id = cellId(code);
      const fill =
        id === 'wall'
          ? THEME.wall
          : id === 'metal'
            ? THEME.surfaces.metal
            : id === 'moss'
              ? THEME.surfaces.soft
              : null;
      ctx.globalAlpha = id === 'wall' ? 0.55 : 0.35;
      ctx.fillStyle = fill ?? colors.dim;
      if (fill || id !== 'floor') ctx.fillRect(cx, cy, cell, cell);
      if (!isTerrain(code)) {
        // A marker: its tool's color and its letter (the cell code, unique to it).
        const tool = EDITOR_TOOLS.find((t) => t.cell === id)!;
        ctx.globalAlpha = 1;
        ctx.fillStyle = colors[tool.color];
        ctx.beginPath();
        ctx.arc(cx + cell / 2, cy + cell / 2, cell * 0.38, 0, Math.PI * 2);
        ctx.fill();
        if (cell >= 12) {
          ctx.fillStyle = THEME.background;
          ctx.font = `bold ${Math.floor(cell * 0.6)}px ${THEME.font}`;
          ctx.textAlign = 'center';
          ctx.fillText(code, cx + cell / 2, cy + cell * 0.72);
        }
      }
    });
    // Faint grid, and the cell under the pointer.
    ctx.globalAlpha = 0.08;
    ctx.strokeStyle = colors.white;
    ctx.lineWidth = 1;
    ctx.strokeRect(gx + 0.5, gy + 0.5, cell * map.width, cell * map.height);
    if (this.hover) {
      ctx.globalAlpha = 0.8;
      ctx.strokeStyle = colors.cyan;
      ctx.strokeRect(gx + this.hover.tx * cell + 0.5, gy + this.hover.ty * cell + 0.5, cell, cell);
    }
    ctx.restore();
  }
}

const ACTIONS: readonly { id: ActionId; label: string }[] = [
  { id: 'play', label: 'TEST PLAY' },
  { id: 'share', label: 'SHARE LINK' },
  { id: 'undo', label: 'UNDO' },
  { id: 'size', label: 'SIZE' },
  { id: 'empty', label: 'NEW EMPTY' },
  { id: 'random', label: 'NEW RANDOM' },
  { id: 'back', label: 'BACK' },
];
