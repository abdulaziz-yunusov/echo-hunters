import type { SynthName } from '@/config/audio';

export interface PlayOptions {
  /** 0..1 */
  gain: number;
  /** -1 left … 1 right. */
  pan: number;
  /** Behind a wall: filtered and dull. */
  muffled: boolean;
  /** Playback pitch multiplier (1 = normal), for small natural variation. */
  pitch: number;
  /**
   * Where the sound is, relative to the listener (world px); null for
   * feedback played centered. Web Audio ignores it; visual sound cues use it.
   */
  offset: { dx: number; dy: number } | null;
}

/**
 * Where the AudioDirector sends its decisions. The real one plays Web Audio
 * (webAudioOutput.ts); tests use a recording fake.
 */
export interface SoundOutput {
  play(synth: SynthName, options: PlayOptions): void;
  /** Ambient drone: `closeness` 0 (calm) … 1 (a hunter is right here). */
  setDrone(closeness: number): void;
  /** Silence the drone (round over / scene left). */
  stopDrone(): void;
}
