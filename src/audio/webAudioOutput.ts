import { AUDIO, type SynthName } from '@/config/audio';
import type { AudioEngine } from './audioEngine';
import type { PlayOptions, SoundOutput } from './soundOutput';
import { SYNTHS } from './synths';

interface Drone {
  oscillators: OscillatorNode[];
  filter: BiquadFilterNode;
  gain: GainNode;
}

/** Plays the director's decisions through Web Audio. Silent until audio is unlocked. */
export class WebAudioOutput implements SoundOutput {
  private readonly engine: AudioEngine;
  private drone: Drone | null = null;

  constructor(engine: AudioEngine) {
    this.engine = engine;
  }

  play(synth: SynthName, o: PlayOptions): void {
    const ctx = this.engine.context;
    const bus = this.engine.sfxBus;
    const noise = this.engine.noiseBuffer();
    if (!ctx || !bus || !noise) return;

    // synth → gain → (muffle) → pan → sfx bus. Nodes are freed when the synth ends.
    const panner = ctx.createStereoPanner();
    panner.pan.value = o.pan;
    panner.connect(bus);
    let into: AudioNode = panner;
    if (o.muffled) {
      const lowpass = ctx.createBiquadFilter();
      lowpass.type = 'lowpass';
      lowpass.frequency.value = AUDIO.muffled.lowpassHz;
      lowpass.connect(panner);
      into = lowpass;
    }
    const gain = ctx.createGain();
    gain.gain.value = o.gain;
    gain.connect(into);
    SYNTHS[synth](ctx, gain, noise, o.pitch);
  }

  setDrone(closeness: number): void {
    const ctx = this.engine.context;
    const drone = this.ensureDrone();
    if (!ctx || !drone) return;
    const d = AUDIO.drone;
    const t = ctx.currentTime;
    const hz = d.baseHz * (1 + d.rise * closeness);
    drone.oscillators[0].frequency.setTargetAtTime(hz, t, d.glide);
    drone.oscillators[1].frequency.setTargetAtTime(hz * 1.498, t, d.glide); // slightly off a fifth: uneasy
    drone.filter.frequency.setTargetAtTime(300 + 900 * closeness, t, d.glide);
    drone.gain.gain.setTargetAtTime(
      d.quietVolume + (d.nearVolume - d.quietVolume) * closeness,
      t,
      d.glide,
    );
  }

  stopDrone(): void {
    const ctx = this.engine.context;
    if (!ctx || !this.drone) return;
    this.drone.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.3);
  }

  /** Build the drone the first time it is needed (audio must be unlocked). */
  private ensureDrone(): Drone | null {
    if (this.drone) return this.drone;
    const ctx = this.engine.context;
    const bus = this.engine.ambientBus;
    if (!ctx || !bus) return null;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.connect(bus);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 300;
    filter.connect(gain);
    const oscillators = [AUDIO.drone.baseHz, AUDIO.drone.baseHz * 1.498].map((hz) => {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = hz;
      osc.connect(filter);
      osc.start();
      return osc;
    });
    this.drone = { oscillators, filter, gain };
    return this.drone;
  }
}
