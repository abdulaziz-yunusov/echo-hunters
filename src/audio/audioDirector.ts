import { AUDIO, AUDIO_EVENTS, AUDIO_SOUNDS } from '@/config/audio';
import type { SoundEmitted } from '@/sim/events';
import type { Simulation } from '@/sim/simulation';
import { hasLineOfSight } from '@/sim/world/visibility';
import { distanceGain, proximity, stereoPan } from './mix';
import type { SoundOutput } from './soundOutput';

/** Footsteps vary this much in pitch (±), so they don't sound machine-made. */
const STEP_PITCH_JITTER = 0.08;

/**
 * Turns what happens in a round into sound (GDD §10), heard from the
 * player's position: panned by where things are, quieter with distance,
 * muffled behind walls, plus a drone that tenses up as a hunter nears.
 * Decides only; the SoundOutput does the playing.
 */
export class AudioDirector {
  private readonly sim: Simulation;
  private readonly out: SoundOutput;
  private readonly unsubscribe: (() => void)[];
  /** Visual/audio variety only; never touches the simulation. */
  private readonly jitter: () => number;

  constructor(sim: Simulation, out: SoundOutput, jitter: () => number = Math.random) {
    this.sim = sim;
    this.out = out;
    this.jitter = jitter;
    const on = sim.events.on.bind(sim.events);
    const centered = (e: keyof typeof AUDIO_EVENTS) => () => this.playCentered(e);
    this.unsubscribe = [
      on('soundEmitted', (s) => this.playSpatial(s)),
      on('coreCollected', (e) => this.ifMine(e.by, 'coreCollected')),
      on('beaconActivated', centered('beaconActivated')),
      on('playerHit', (e) => this.ifMine(e.target, 'playerHit')),
      on('hunterStunned', centered('hunterStunned')),
      on('closeCall', centered('closeCall')),
      on('pickupCollected', (e) => this.ifMine(e.by, 'pickupCollected')),
      on('stoneThrown', centered('stoneThrown')),
      // Duel tools (Phase 29): your flare going up, or the rival's finding you.
      on('toolUsed', (e) => (e.tool === 'flare' ? this.ifMine(e.by, 'flare') : undefined)),
      on('flareSeen', centered('flare')),
      on('overtimeStarted', centered('overtimeStarted')),
      // Duel (Phase 28): both players hear a steal and an extraction starting.
      on('coreStolen', centered('coreStolen')),
      on('extractStarted', centered('extractStarted')),
      on('roundEnded', (e) => {
        this.out.stopDrone();
        this.playCentered(e.status === 'extracted' ? 'extracted' : 'died');
      }),
    ];
  }

  /** Call after every simulation tick: keeps the drone in step with the nearest hunter. */
  tick(): void {
    const { player, hunters, status } = this.sim.state;
    if (status !== 'playing') return;
    let nearest: number | null = null;
    for (const h of hunters) {
      const d = Math.hypot(h.x - player.x, h.y - player.y);
      if (nearest === null || d < nearest) nearest = d;
    }
    this.out.setDrone(proximity(nearest, AUDIO.drone.range));
  }

  dispose(): void {
    for (const off of this.unsubscribe) off();
    this.out.stopDrone();
  }

  private playSpatial(sound: SoundEmitted): void {
    const def = AUDIO_SOUNDS[sound.kind];
    const { player, walls } = this.sim.state;
    const dx = sound.x - player.x;
    const dy = sound.y - player.y;
    const distance = Math.hypot(dx, dy);
    // The round's rules (Phase 30: Echo Chamber) carry sound further for the ears too.
    const gain = def.volume * distanceGain(distance, def.range * this.sim.state.rules.soundHearing);
    if (gain <= 0.001) return;

    const muffled = distance > 1 && !hasLineOfSight(walls, sound.x, sound.y, player.x, player.y);
    const isStep = sound.kind === 'step' || sound.kind === 'hunterStep';
    this.out.play(def.synth, {
      gain: muffled ? gain * AUDIO.muffled.gain : gain,
      pan: stereoPan(dx, AUDIO.panRange),
      muffled,
      pitch: isStep ? 1 + (this.jitter() * 2 - 1) * STEP_PITCH_JITTER : 1,
      offset: { dx, dy },
    });
  }

  /** Personal feedback plays only for this machine's player (a duel rival's is secret). */
  private ifMine(who: number, event: keyof typeof AUDIO_EVENTS): void {
    if (who === this.sim.state.player.id) this.playCentered(event);
  }

  private playCentered(event: keyof typeof AUDIO_EVENTS): void {
    const def = AUDIO_EVENTS[event];
    this.out.play(def.synth, { gain: def.volume, pan: 0, muffled: false, pitch: 1, offset: null });
  }
}
