import type { SoundTag } from './sounds';

/** Which AI module drives the hunter. New numbers-only variants reuse an existing behaviour. */
export type HunterBehaviourId = 'stalker' | 'listener' | 'tracker' | 'echo' | 'mimic';

export interface HunterTypeDef {
  behaviour: HunterBehaviourId;
  /** px per second; 0 = stationary */
  speed: number;
  /** Sound tags this hunter reacts to. */
  hears: readonly SoundTag[];
  /** Seconds spent searching after reaching a sound origin. */
  searchTime: number;
  /** Radius around the sound origin to pick search points from (px). */
  searchRadius: number;
  /** Seconds between own footsteps while moving (0 = silent). */
  footstepInterval: number;
  /** Listener only: max distance at which it hears anything (px). */
  hearRange?: number;
  /** Listener only: degrees per second of idle rotation. */
  turnSpeed?: number;
  /** Listener only: seconds between screams. */
  screamCooldown?: number;
  /** Tracker only: the trail is lost where two steps lie further apart than this (px). */
  trailGap?: number;
  /** Tracker only: seconds between sniffs while it follows a trail (its tell). */
  sniffInterval?: number;
  /** Echo only: still this long (s), it plays its rewind tell when it moves again. */
  wakeQuiet?: number;
  /** Mimic only: seconds between hearing a ping and answering it with a fake one. */
  echoDelay?: number;
  /** Mimic only: lunges at a player this close (px) and in line of sight. */
  lungeRange?: number;
  /** Mimic only: lunge speed (px/s) and length (s). */
  lungeSpeed?: number;
  lungeTime?: number;
  /** Mimic only: seconds before it can lunge again. */
  lungeCooldown?: number;
}

/** GDD §5 hunter types, plus the Phase 19 three (Tracker, Echo, Mimic). */
export const HUNTER_TYPES = {
  stalker: {
    behaviour: 'stalker',
    speed: 90,
    // The beacon too: "it is loud, so everyone knows where it is" (GDD §2).
    hears: ['footstep', 'ping', 'impact', 'shockwave', 'scream', 'beacon', 'carry'],
    searchTime: 4,
    searchRadius: 100,
    footstepInterval: 0.45,
  },
  sprinter: {
    behaviour: 'stalker',
    speed: 180,
    hears: ['ping', 'shockwave', 'scream'],
    searchTime: 4,
    searchRadius: 100,
    footstepInterval: 0.25,
  },
  listener: {
    behaviour: 'listener',
    speed: 0,
    hears: ['footstep', 'ping', 'impact', 'shockwave', 'carry'],
    searchTime: 0,
    searchRadius: 0,
    footstepInterval: 0,
    hearRange: 300,
    turnSpeed: 30,
    screamCooldown: 4,
  },
  // Follows your footsteps, not your noise: sneaking, boots and sound cover break the trail.
  tracker: {
    behaviour: 'tracker',
    speed: 110,
    hears: ['footstep'],
    searchTime: 3,
    searchRadius: 80,
    footstepInterval: 0.45,
    trailGap: 120,
    sniffInterval: 1.2,
  },
  // Moves only while a sound you made is still spreading. Silent.
  echo: {
    behaviour: 'echo',
    speed: 160,
    hears: ['footstep', 'ping', 'impact', 'shockwave', 'carry'],
    searchTime: 0,
    searchRadius: 0,
    footstepInterval: 0,
    wakeQuiet: 1,
  },
  // Sits in a room humming like a core; answers pings; lunges at whoever comes close.
  mimic: {
    behaviour: 'mimic',
    // Walking back to its spot after a lunge.
    speed: 80,
    hears: ['ping'],
    searchTime: 0,
    searchRadius: 0,
    footstepInterval: 0.45,
    echoDelay: 0.6,
    lungeRange: 60,
    lungeSpeed: 250,
    lungeTime: 0.5,
    lungeCooldown: 2,
  },
} as const satisfies Record<string, HunterTypeDef>;

export type HunterTypeId = keyof typeof HUNTER_TYPES;

/** Rules shared by every hunter type. */
export const HUNTER_COMMON = {
  radius: 10,
  /** Minimum BFS path distance from the player spawn, in tiles. */
  spawnMinTiles: 12,
  attackDamage: 1,
  /** Pause after a successful hit before searching again (s). */
  attackRecover: 0.6,
  stunTime: 3,
  /** Idle wandering: how far a hunter strolls (tiles), how fast (x speed), pauses between strolls (s). */
  wanderRangeTiles: 6,
  wanderSpeedFactor: 0.55,
  idlePause: { min: 0.6, max: 2 },
  /** Searching around a sound moves this much slower than a chase (x speed). */
  searchSpeedFactor: 0.8,
  /** Give up on a goal after this long without making progress (s). */
  stuckTimeout: 1.5,
  /** Players' footsteps are remembered this long, for the Tracker (s). */
  trailLife: 12,
};
