import type { TutorialId } from '@/config/levels';
import type { Simulation } from '@/sim/simulation';

/** What the player has done so far this level, as the tutorial sees it. */
interface Progress {
  pings: number;
  /** Charged pings (Phase 18). */
  beams: number;
  cores: number;
  stonesThrown: number;
  shockwaves: number;
  hits: number;
  /** Seconds spent sneaking while moving. */
  sneakTime: number;
  /** A hunter's footsteps have been heard nearby. */
  hunterHeard: boolean;
  /** Nearest hunter within touching distance soon. */
  hunterClose: boolean;
  beaconActive: boolean;
}

interface Step {
  id: string;
  text: string;
  /** Becomes relevant. */
  when(p: Progress): boolean;
  /** Can be dismissed (after being shown `shown` seconds). */
  done(p: Progress, shown: number): boolean;
}

/** Level 1 prompts (GDD §7 "tutorial prompts"). Order matters: earlier steps win. */
const BASICS: readonly Step[] = [
  {
    id: 'ping',
    text: 'SPACE: sonar ping. Sound shows the walls, but hunters hear it too.',
    when: () => true,
    done: (p) => p.pings > 0,
  },
  {
    id: 'cores',
    text: 'Find 3 Signal Cores. Each one hums quietly: watch and listen for it.',
    when: (p) => p.pings > 0,
    done: (p, shown) => p.cores > 0 || shown > 12,
  },
  {
    id: 'sneak',
    text: 'Hunters are blind but hear everything. Hold SHIFT to sneak silently.',
    when: (p) => p.hunterHeard || p.cores > 0,
    done: (p, shown) => p.sneakTime > 1 || shown > 10,
  },
  {
    id: 'shockwave',
    text: 'Too close? CLICK or E: a shockwave stuns hunters around you.',
    when: (p) => p.hits > 0 || p.hunterClose,
    done: (p, shown) => p.shockwaves > 0 || shown > 8,
  },
  {
    id: 'stone',
    text: 'Q: throw a decoy stone at the cursor. Hunters go where it lands.',
    when: (p) => p.cores >= 2 || p.hits > 0,
    done: (p, shown) => p.stonesThrown > 0 || shown > 10,
  },
  {
    id: 'beacon',
    text: 'All cores found: the beacon is awake. Reach it to extract!',
    when: (p) => p.beaconActive,
    done: (_p, shown) => shown > 8,
  },
];

/** Level 2: the charged ping, once the player has pinged on this level. */
const BEAM: readonly Step[] = [
  {
    id: 'beam',
    text: 'New: hold SPACE to charge a beam. Aim, release: it reaches far, but only ahead.',
    when: (p) => p.pings > 0,
    done: (p, shown) => p.beams > 0 || shown > 12,
  },
];

const STEP_SETS: Record<TutorialId, readonly Step[]> = { basics: BASICS, beam: BEAM };

/** A prompt stays up at least this long, so it can be read (s). */
const MIN_SHOW = 1.5;
/** Hunter footsteps closer than this count as "heard" (px). */
const HEARD_RANGE = 280;
/** A hunter closer than this is about to touch (px). */
const CLOSE_RANGE = 110;

/**
 * Trigger-based prompts for early levels: each appears when it becomes
 * relevant and goes once the player has done it (or read it long enough).
 * Only watches the round; it never changes it.
 */
export class Tutorial {
  private readonly sim: Simulation;
  private readonly steps: readonly Step[];
  private readonly unsubscribe: (() => void)[];
  private readonly finished = new Set<string>();
  private readonly progress: Progress = {
    pings: 0,
    beams: 0,
    cores: 0,
    stonesThrown: 0,
    shockwaves: 0,
    hits: 0,
    sneakTime: 0,
    hunterHeard: false,
    hunterClose: false,
    beaconActive: false,
  };
  private current: Step | null = null;
  private shown = 0;

  constructor(sim: Simulation, set: TutorialId) {
    this.sim = sim;
    this.steps = STEP_SETS[set];
    const p = this.progress;
    const on = sim.events.on.bind(sim.events);
    this.unsubscribe = [
      on('soundEmitted', (s) => {
        const me = sim.state.player;
        if (s.owner === me.id && s.kind === 'ping') p.pings++;
        if (s.owner === me.id && s.kind === 'pingBeam') p.beams++;
        if (s.owner === me.id && s.kind === 'shockwave') p.shockwaves++;
        if (s.kind === 'hunterStep' && Math.hypot(s.x - me.x, s.y - me.y) < HEARD_RANGE) {
          p.hunterHeard = true;
        }
      }),
      on('coreCollected', () => p.cores++),
      on('stoneThrown', () => p.stonesThrown++),
      on('playerHit', () => p.hits++),
    ];
  }

  /** The prompt to show now, if any. */
  get text(): string | null {
    return this.current?.text ?? null;
  }

  /** Fade-in of the current prompt, 0..1. */
  get opacity(): number {
    return Math.min(1, this.shown / 0.3);
  }

  /** Call after every simulation tick. */
  tick(dt: number): void {
    const { player, hunters, beacon } = this.sim.state;
    const p = this.progress;
    if (player.sneaking && Math.hypot(player.vx, player.vy) > 1) p.sneakTime += dt;
    p.beaconActive = beacon.active;
    p.hunterClose = hunters.some((h) => Math.hypot(h.x - player.x, h.y - player.y) < CLOSE_RANGE);

    if (this.current) {
      this.shown += dt;
      if (this.shown >= MIN_SHOW && this.current.done(p, this.shown)) {
        this.finished.add(this.current.id);
        this.current = null;
      }
      return;
    }
    const next = this.steps.find((s) => !this.finished.has(s.id) && s.when(p));
    if (next) {
      this.current = next;
      this.shown = 0;
    }
  }

  dispose(): void {
    for (const off of this.unsubscribe) off();
  }
}
