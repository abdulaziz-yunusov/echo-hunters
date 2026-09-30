import type { SynthName } from '@/config/audio';
import type { PlayOptions, SoundOutput } from './soundOutput';

/** Sends every decision to several outputs (e.g. the speakers and the visual sound cues). */
export class FanOut implements SoundOutput {
  private readonly outputs: readonly SoundOutput[];

  constructor(...outputs: SoundOutput[]) {
    this.outputs = outputs;
  }

  play(synth: SynthName, options: PlayOptions): void {
    for (const o of this.outputs) o.play(synth, options);
  }

  setDrone(closeness: number): void {
    for (const o of this.outputs) o.setDrone(closeness);
  }

  stopDrone(): void {
    for (const o of this.outputs) o.stopDrone();
  }
}
