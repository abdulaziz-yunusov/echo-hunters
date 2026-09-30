import { FanOut } from '@/audio/fanOut';
import type { SoundOutput } from '@/audio/soundOutput';
import type { Vec2 } from '@/core/geometry';
import { loadSave } from '@/platform/storage';
import type { Camera } from '@/render/camera';
import { SoundCues } from '@/render/soundCues';
import type { WorldRenderer } from '@/render/worldRenderer';

/**
 * The player's display settings (shake, flashes, visual sound cues) applied
 * to one round's camera and world. Shared by solo and duel scenes.
 */
export class RoundDisplay {
  private readonly camera: Camera;
  private readonly world: WorldRenderer;
  private readonly cues = new SoundCues();
  private showCues = false;

  constructor(camera: Camera, world: WorldRenderer) {
    this.camera = camera;
    this.world = world;
    this.refresh();
  }

  /** Re-read the saved settings: at the start, and when a settings menu on top closes. */
  refresh(): void {
    const d = loadSave().display;
    this.camera.shakeScale = d.shake;
    this.world.flashIntensity = d.flash;
    this.showCues = d.soundCues;
    if (!this.showCues) this.cues.clear();
  }

  /** Where the round's AudioDirector should send sound: the speakers and the cues. */
  output(speakers: SoundOutput): SoundOutput {
    return new FanOut(speakers, this.cues);
  }

  update(dt: number): void {
    this.cues.update(dt);
  }

  /** Screen-space overlay; call after the world, before the HUD. `player` is in world px. */
  draw(ctx: CanvasRenderingContext2D, width: number, height: number, player: Vec2): void {
    if (!this.showCues) return;
    this.cues.draw(ctx, width, height, this.camera.worldToScreen(player.x, player.y));
  }
}
