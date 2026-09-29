import { ACTION_LABELS, REMAPPABLE, type RemappableAction } from '@/config/input';
import { THEME } from '@/config/theme';
import { inputLabel, rebind, withOverrides, type BindingOverrides } from '@/input/bindings';
import type { InputFrame } from '@/input/inputFrame';
import { loadSave, updateSave } from '@/platform/storage';
import { drawText } from '@/render/text';
import { MenuList } from '@/ui/menuList';
import { drawMenu, drawTitle } from '@/ui/menuRenderer';
import type { AppContext, Scene } from './scene';

const MENU_WIDTH = 460;

/** Rebind gameplay keys: pick an action, press the new key or mouse button. */
export class ControlsScene implements Scene {
  readonly name = 'Controls';
  private readonly app: AppContext;
  private readonly menu: MenuList;
  private overrides: BindingOverrides;
  /** The action waiting for its new key, if any. */
  private waiting: RemappableAction | null = null;

  constructor(app: AppContext) {
    this.app = app;
    this.overrides = loadSave().bindings;
    this.menu = new MenuList([
      ...REMAPPABLE.map((action) => ({
        kind: 'action' as const,
        label: ACTION_LABELS[action].toUpperCase(),
        value: () => withOverrides(this.overrides)[action].map(inputLabel).join(' / '),
        onSelect: () => this.listenFor(action),
      })),
      { kind: 'action', label: 'RESET TO DEFAULTS', onSelect: () => this.apply({}) },
      { kind: 'action', label: 'BACK', onSelect: () => app.close() },
    ]);
  }

  update(_dt: number, input: InputFrame): void {
    if (this.waiting) return; // the next key goes to the capture, not the menu
    if (input.back || input.pause) {
      this.app.close();
      return;
    }
    this.menu.update(input);
  }

  exit(): void {
    this.app.input.cancelCapture();
  }

  render(ctx: CanvasRenderingContext2D): void {
    const { width, height } = this.app.viewport;
    ctx.fillStyle = THEME.background;
    ctx.fillRect(0, 0, width, height);
    const top = Math.max(60, height * 0.12);
    drawTitle(ctx, 'CONTROLS', width / 2, top);
    drawMenu(ctx, this.menu, width / 2, top + 56, Math.min(MENU_WIDTH, width - 32));

    const note = this.waiting
      ? `PRESS A KEY OR MOUSE BUTTON FOR ${ACTION_LABELS[this.waiting].toUpperCase()} · ESC CANCELS`
      : 'Pick an action, then press its new key. Keys already in use swap places.';
    drawText(ctx, note, width / 2, height - 36, {
      size: 12,
      color: this.waiting ? THEME.colors.cyan : THEME.colors.white,
      align: 'center',
      alpha: this.waiting ? 1 : 0.5,
    });
  }

  private listenFor(action: RemappableAction): void {
    this.waiting = action;
    this.app.input.captureNextInput((id) => {
      this.waiting = null;
      if (id === 'Escape') return;
      this.apply(rebind(this.overrides, action, id));
    });
  }

  private apply(overrides: BindingOverrides): void {
    this.overrides = overrides;
    this.app.input.setBindings(withOverrides(overrides));
    updateSave({ bindings: overrides });
  }
}
