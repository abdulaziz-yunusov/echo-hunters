import type { SoundTag } from './sounds';

/** Which AI module drives the hunter. New numbers-only variants reuse an existing behaviour. */
export type HunterBehaviourId = 'stalker' | 'listener';

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
}

/** GDD §5 hunter types. */
export const HUNTER_TYPES = {
  stalker: {
    behaviour: 'stalker',
    speed: 90,
    hears: ['footstep', 'ping', 'impact', 'shockwave', 'scream'],
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
    hears: ['footstep', 'ping', 'impact', 'shockwave'],
    searchTime: 0,
    searchRadius: 0,
    footstepInterval: 0,
    hearRange: 300,
    turnSpeed: 30,
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
};
