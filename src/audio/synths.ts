import type { SynthName } from '@/config/audio';

/**
 * A synthesized sound: schedules its nodes into `out`, starting now.
 * `pitch` multiplies every frequency (1 = normal).
 */
type Synth = (ctx: AudioContext, out: AudioNode, noise: AudioBuffer, pitch: number) => void;

const SILENT = 0.0001;

/** Envelope starting at time `t`: silent → peak in `attack` s → fade out over `decay` s. */
function envelope(
  ctx: AudioContext,
  out: AudioNode,
  t: number,
  peak: number,
  attack: number,
  decay: number,
): GainNode {
  const g = ctx.createGain();
  g.gain.setValueAtTime(SILENT, t);
  g.gain.linearRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(SILENT, t + attack + decay);
  g.connect(out);
  return g;
}

/** An oscillator gliding from `from` to `to` Hz over `glide` seconds. */
function tone(
  ctx: AudioContext,
  out: AudioNode,
  type: OscillatorType,
  from: number,
  to: number,
  glide: number,
  peak: number,
  attack: number,
  decay: number,
  delay = 0,
): void {
  const t = ctx.currentTime + delay;
  const env = envelope(ctx, out, t, peak, attack, decay);
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(from, t);
  if (to !== from) osc.frequency.exponentialRampToValueAtTime(to, t + glide);
  osc.connect(env);
  osc.start(t);
  osc.stop(t + attack + decay + 0.05);
}

/** A burst of filtered white noise. */
function noiseBurst(
  ctx: AudioContext,
  out: AudioNode,
  noise: AudioBuffer,
  filter: BiquadFilterType,
  frequency: number,
  q: number,
  peak: number,
  attack: number,
  decay: number,
  sweepTo?: number,
): void {
  const t = ctx.currentTime;
  const env = envelope(ctx, out, t, peak, attack, decay);
  const f = ctx.createBiquadFilter();
  f.type = filter;
  f.frequency.setValueAtTime(frequency, t);
  if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + attack + decay);
  f.Q.value = q;
  f.connect(env);
  const src = ctx.createBufferSource();
  src.buffer = noise;
  src.connect(f);
  // Start somewhere random in the buffer so repeats don't sound identical.
  src.start(t, Math.random() * (noise.duration - 0.5));
  src.stop(t + attack + decay + 0.05);
}

const ping: Synth = (ctx, out, _n, p) =>
  tone(ctx, out, 'sine', 1200 * p, 400 * p, 0.3, 0.5, 0.005, 0.5);

export const SYNTHS: Record<SynthName, Synth> = {
  // GDD: sine sweep from 1200 Hz down to 400 Hz over 0.3 s.
  ping,

  // A ping squeezed into a beam: higher, longer, with a bright edge.
  pingBeam: (ctx, out, _n, p) => {
    tone(ctx, out, 'sine', 1800 * p, 600 * p, 0.5, 0.45, 0.005, 0.7);
    tone(ctx, out, 'triangle', 2600 * p, 1900 * p, 0.12, 0.12, 0.002, 0.2);
  },

  // GDD: short filtered noise burst.
  step: (ctx, out, n, p) => noiseBurst(ctx, out, n, 'bandpass', 1100 * p, 0.9, 0.6, 0.003, 0.07),

  // Lower and heavier than the player's: a thump you learn to fear.
  hunterStep: (ctx, out, n, p) => {
    noiseBurst(ctx, out, n, 'lowpass', 380 * p, 0.7, 0.9, 0.004, 0.14);
    tone(ctx, out, 'sine', 75 * p, 55 * p, 0.1, 0.5, 0.004, 0.12);
  },

  // A grate under your feet: a bright, ringing clank.
  stepMetal: (ctx, out, n, p) => {
    noiseBurst(ctx, out, n, 'bandpass', 3200 * p, 4, 0.6, 0.002, 0.09);
    tone(ctx, out, 'triangle', 1850 * p, 1780 * p, 0.2, 0.18, 0.002, 0.25);
    tone(ctx, out, 'triangle', 2790 * p, 2700 * p, 0.2, 0.08, 0.002, 0.18);
  },

  // Moss: barely a brush.
  stepSoft: (ctx, out, n, p) => noiseBurst(ctx, out, n, 'lowpass', 500 * p, 0.5, 0.35, 0.01, 0.08),

  // A hunter on a grate: its heavy thump with a metal ring over it.
  hunterStepMetal: (ctx, out, n, p) => {
    noiseBurst(ctx, out, n, 'lowpass', 380 * p, 0.7, 0.9, 0.004, 0.14);
    tone(ctx, out, 'sine', 75 * p, 55 * p, 0.1, 0.5, 0.004, 0.12);
    tone(ctx, out, 'triangle', 930 * p, 900 * p, 0.3, 0.2, 0.003, 0.4);
    noiseBurst(ctx, out, n, 'bandpass', 2400 * p, 5, 0.35, 0.002, 0.12);
  },

  // A knock, with a faint ping under it: the decoy fakes a ping.
  stone: (ctx, out, n, p) => {
    tone(ctx, out, 'triangle', 950 * p, 600 * p, 0.05, 0.4, 0.002, 0.09);
    noiseBurst(ctx, out, n, 'highpass', 2600 * p, 0.7, 0.3, 0.001, 0.04);
    tone(ctx, out, 'sine', 1200 * p, 400 * p, 0.3, 0.18, 0.01, 0.45, 0.03);
  },

  throw: (ctx, out, n) => noiseBurst(ctx, out, n, 'bandpass', 600, 1.2, 0.25, 0.03, 0.15, 2200),

  shockwave: (ctx, out, n, p) => {
    tone(ctx, out, 'sine', 140 * p, 35 * p, 0.45, 0.9, 0.005, 0.55);
    noiseBurst(ctx, out, n, 'lowpass', 900, 0.8, 0.6, 0.004, 0.3, 120);
  },

  // GDD: slow 80 Hz throb.
  beacon: (ctx, out, _n, p) => {
    tone(ctx, out, 'sine', 80 * p, 80 * p, 0, 0.8, 0.08, 0.9);
    tone(ctx, out, 'sine', 160 * p, 160 * p, 0, 0.2, 0.08, 0.6);
  },

  wallBump: (ctx, out, n, p) => {
    tone(ctx, out, 'sine', 95 * p, 60 * p, 0.1, 0.6, 0.003, 0.12);
    noiseBurst(ctx, out, n, 'lowpass', 500, 0.7, 0.4, 0.002, 0.06);
  },

  coreHum: (ctx, out, _n, p) => {
    tone(ctx, out, 'sine', 520 * p, 520 * p, 0, 0.25, 0.1, 0.5);
    tone(ctx, out, 'sine', 780 * p, 776 * p, 0.6, 0.08, 0.1, 0.45);
  },

  // Cores being carried (Phase 28): the core's two notes, lower and with a wobble, so a
  // carrier sounds different from a core lying on the floor.
  carryHum: (ctx, out, _n, p) => {
    tone(ctx, out, 'triangle', 330 * p, 350 * p, 0.25, 0.28, 0.05, 0.45);
    tone(ctx, out, 'sine', 495 * p, 470 * p, 0.25, 0.14, 0.05, 0.45, 0.12);
  },

  // A fan spinning up for a couple of seconds: a low rumble and airy hiss (covers footsteps).
  vent: (ctx, out, n, p) => {
    noiseBurst(ctx, out, n, 'lowpass', 420 * p, 0.6, 0.55, 0.35, 2.1);
    noiseBurst(ctx, out, n, 'bandpass', 1400 * p, 0.7, 0.18, 0.4, 1.9);
    tone(ctx, out, 'sawtooth', 58 * p, 62 * p, 2, 0.12, 0.3, 2.1);
  },

  // A single drop into a puddle.
  drip: (ctx, out, _n, p) => {
    tone(ctx, out, 'sine', 1500 * p, 650 * p, 0.06, 0.4, 0.002, 0.14);
    tone(ctx, out, 'sine', 900 * p, 1100 * p, 0.05, 0.12, 0.01, 0.1, 0.05);
  },

  scream: (ctx, out, _n, p) => {
    tone(ctx, out, 'sawtooth', 700 * p, 1500 * p, 0.35, 0.35, 0.02, 0.8);
    tone(ctx, out, 'sawtooth', 715 * p, 1450 * p, 0.4, 0.25, 0.02, 0.8);
  },

  coreCollected: (ctx, out) => {
    [660, 880, 1320].forEach((f, i) =>
      tone(ctx, out, 'triangle', f, f, 0, 0.35, 0.005, 0.25, i * 0.07),
    );
  },

  beaconOn: (ctx, out) => {
    for (const f of [220, 277, 330]) tone(ctx, out, 'sine', f, f, 0, 0.22, 0.3, 1.2);
  },

  hit: (ctx, out, n) => {
    tone(ctx, out, 'sawtooth', 110, 55, 0.3, 0.5, 0.003, 0.3);
    noiseBurst(ctx, out, n, 'lowpass', 1500, 0.6, 0.5, 0.002, 0.15);
  },

  stun: (ctx, out) => tone(ctx, out, 'square', 320, 110, 0.25, 0.18, 0.003, 0.28),

  // A soft breath out: you got away.
  closeCall: (ctx, out, n) => {
    noiseBurst(ctx, out, n, 'bandpass', 1800, 0.8, 0.25, 0.08, 0.4, 500);
    tone(ctx, out, 'sine', 740, 494, 0.35, 0.12, 0.02, 0.35);
  },

  pickup: (ctx, out) => {
    tone(ctx, out, 'sine', 990, 990, 0, 0.3, 0.004, 0.12);
    tone(ctx, out, 'sine', 1320, 1320, 0, 0.3, 0.004, 0.16, 0.08);
  },

  extract: (ctx, out) => {
    tone(ctx, out, 'sine', 300, 900, 0.6, 0.35, 0.02, 1);
    for (const f of [440, 554, 660]) tone(ctx, out, 'triangle', f, f, 0, 0.15, 0.4, 1, 0.4);
  },

  // Duel (Phase 28): a core snatched from the rival's drop. A quick upward grab.
  steal: (ctx, out, n) => {
    noiseBurst(ctx, out, n, 'highpass', 2500, 0.7, 0.25, 0.002, 0.08);
    tone(ctx, out, 'square', 440, 1320, 0.12, 0.2, 0.005, 0.22);
    tone(ctx, out, 'triangle', 880, 880, 0, 0.18, 0.01, 0.3, 0.12);
  },

  // Duel: someone started extracting. A rising two-tone alarm.
  extracting: (ctx, out) => {
    for (let i = 0; i < 3; i++) {
      tone(ctx, out, 'sawtooth', 300, 600, 0.18, 0.12, 0.01, 0.2, i * 0.22);
    }
  },

  death: (ctx, out, n) => {
    tone(ctx, out, 'sawtooth', 220, 40, 1.2, 0.45, 0.01, 1.3);
    noiseBurst(ctx, out, n, 'lowpass', 2000, 0.7, 0.4, 0.01, 1, 150);
  },
};
