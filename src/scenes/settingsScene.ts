import { THEME } from '@/config/theme';
import type { InputFrame } from '@/input/inputFrame';
import { updateSave, type AudioSettings } from '@/platform/storage';
import { levelBar, MenuList } from '@/ui/menuList';
import { drawMenu, drawTitle } from '@/ui/menuRenderer';
import type { AppContext, Scene } from './scene';

const VOLUME_STEP = 0.1;
const MENU_WIDTH = 460;

/** Sound and controls. Every change applies and is saved at once. */
export class SettingsScene implements Scene {
  readonly name = 'Settings';
  private readonly app: AppContext;
  private readonly menu: MenuList;

  constructor(app: AppContext) {
    this.app = app;
    const volume = (label: string, key: 'master' | 'sfx' | 'ambient') => ({
      kind: 'adjust' as const,
      label,
      value: () => levelBar(this.settings()[key]),
      onChange: (step: 1 | -1) => {
        const v = Math.round((this.settings()[key] + step * VOLUME_STEP) * 10) / 10;
        this.change({ [key]: Math.min(1, Math.max(0, v)) });
      },
    });
    this.menu = new MenuList([
      volume('MASTER VOLUME', 'master'),
      volume('EFFECTS', 'sfx'),
      volume('AMBIENT DRONE', 'ambient'),
      {
        kind: 'adjust',
        label: 'SOUND',
        value: () => (this.settings().muted ? 'OFF' : 'ON'),
        onChange: () => this.change({ muted: !this.settings().muted }),
      },
      { kind: 'action', label: 'CONTROLS', onSelect: () => app.open('controls') },
      { kind: 'action', label: 'BACK', onSelect: () => app.close() },
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
    drawTitle(ctx, 'SETTINGS', width / 2, height * 0.2);
    drawMenu(ctx, this.menu, width / 2, height * 0.2 + 70, Math.min(MENU_WIDTH, width - 32));
  }

  private settings(): AudioSettings {
    return this.app.audio.getSettings();
  }

  private change(changes: Partial<AudioSettings>): void {
    const next = { ...this.settings(), ...changes };
    this.app.audio.setSettings(next);
    updateSave({ audio: next });
  }
}
