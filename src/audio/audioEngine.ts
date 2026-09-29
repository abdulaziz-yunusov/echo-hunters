import type { AudioSettings } from '@/platform/storage';

/** Seconds of white noise shared by every noisy synth. */
const NOISE_SECONDS = 2;

interface Buses {
  master: GainNode;
  sfx: GainNode;
  ambient: GainNode;
}

/**
 * Owns the Web Audio context and the mix buses (master → sfx / ambient).
 * Browsers only allow audio after a user gesture, so the context is
 * created on the first click, tap or key press. It is suspended while the
 * tab is hidden.
 */
export class AudioEngine {
  private ctx: AudioContext | null = null;
  private buses: Buses | null = null;
  private noise: AudioBuffer | null = null;
  private settings: AudioSettings;

  constructor(settings: AudioSettings) {
    this.settings = { ...settings };
    window.addEventListener('pointerdown', this.unlock, true);
    window.addEventListener('keydown', this.unlock, true);
    document.addEventListener('visibilitychange', this.onVisibility);
  }

  /** The context, once audio is allowed and running; null before that. */
  get context(): AudioContext | null {
    return this.ctx?.state === 'running' ? this.ctx : null;
  }

  get sfxBus(): GainNode | null {
    return this.buses?.sfx ?? null;
  }

  get ambientBus(): GainNode | null {
    return this.buses?.ambient ?? null;
  }

  get muted(): boolean {
    return this.settings.muted;
  }

  /** Shared white-noise buffer for noisy synths. */
  noiseBuffer(): AudioBuffer | null {
    return this.noise;
  }

  setMuted(muted: boolean): void {
    this.settings.muted = muted;
    this.applyVolumes();
  }

  /** Change volumes and mute at once (settings screen). */
  setSettings(settings: AudioSettings): void {
    this.settings = { ...settings };
    this.applyVolumes();
  }

  /** Current settings, for saving. */
  getSettings(): AudioSettings {
    return { ...this.settings };
  }

  private readonly unlock = (): void => {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      const master = this.ctx.createGain();
      const sfx = this.ctx.createGain();
      const ambient = this.ctx.createGain();
      sfx.connect(master);
      ambient.connect(master);
      // A limiter at the end, so several loud sounds at once never distort.
      const limiter = this.ctx.createDynamicsCompressor();
      limiter.threshold.value = -6;
      limiter.knee.value = 6;
      limiter.ratio.value = 12;
      limiter.attack.value = 0.003;
      limiter.release.value = 0.2;
      master.connect(limiter);
      limiter.connect(this.ctx.destination);
      this.buses = { master, sfx, ambient };
      this.noise = createNoise(this.ctx);
      this.applyVolumes();
    }
    void this.ctx.resume().then(() => {
      if (this.ctx?.state !== 'running') return;
      window.removeEventListener('pointerdown', this.unlock, true);
      window.removeEventListener('keydown', this.unlock, true);
    });
  };

  private readonly onVisibility = (): void => {
    if (!this.ctx) return;
    if (document.hidden) void this.ctx.suspend();
    else void this.ctx.resume();
  };

  private applyVolumes(): void {
    if (!this.buses || !this.ctx) return;
    const t = this.ctx.currentTime;
    const s = this.settings;
    this.buses.master.gain.setTargetAtTime(s.muted ? 0 : s.master, t, 0.02);
    this.buses.sfx.gain.setTargetAtTime(s.sfx, t, 0.02);
    this.buses.ambient.gain.setTargetAtTime(s.ambient, t, 0.02);
  }
}

function createNoise(ctx: AudioContext): AudioBuffer {
  const buffer = ctx.createBuffer(1, ctx.sampleRate * NOISE_SECONDS, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}
