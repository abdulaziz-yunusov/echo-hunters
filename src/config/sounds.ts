import type { ColorKey } from './theme';

/**
 * Tags describe what a sound "is". Hunters react to tags (see hunters.ts),
 * so a new sound only needs the right tags to be heard correctly.
 */
export type SoundTag =
  | 'footstep'
  | 'ping'
  | 'impact'
  | 'shockwave'
  | 'hunter'
  | 'scream'
  | 'beacon'
  | 'ambient'
  /** Duel: cores being carried (Phase 28). */
  | 'carry';

export interface SoundKindDef {
  /** How far the visible ring spreads, lighting walls (px). */
  maxRadius: number;
  /**
   * How far hunters can hear it (px of effective distance: straight line in
   * sight, or muffled corridor distance around corners). Separate from the
   * ring so loud sounds carry further than you can see.
   */
  hearRadius: number;
  /** px per second: how fast the ring spreads and how fast sound reaches hunters. */
  speed: number;
  color: ColorKey;
  tags: readonly SoundTag[];
  /**
   * Directional sound (Phase 18): the ring spreads only in a wedge this wide
   * (degrees), aimed when it is made. Omitted = all around.
   */
  arc?: number;
  /** Directional sound: hearing range outside the wedge (inside it is `hearRadius`). */
  sideHearRadius?: number;
}

/** GDD §4 sound table, plus hearing ranges (see DECISIONS.md, Phase 6). */
export const SOUND_KINDS = {
  step: { maxRadius: 60, hearRadius: 90, speed: 200, color: 'dim', tags: ['footstep'] },
  // Phase 16 floors: a clang on metal grates, a whisper on moss.
  stepMetal: { maxRadius: 90, hearRadius: 180, speed: 220, color: 'white', tags: ['footstep'] },
  stepSoft: { maxRadius: 40, hearRadius: 40, speed: 180, color: 'dim', tags: ['footstep'] },
  ping: { maxRadius: 400, hearRadius: 800, speed: 350, color: 'cyan', tags: ['ping'] },
  // Phase 18 charged ping: a long, narrow beam, loud ahead and quiet to the sides.
  pingBeam: {
    maxRadius: 700,
    hearRadius: 900,
    sideHearRadius: 250,
    speed: 450,
    color: 'cyan',
    tags: ['ping'],
    arc: 40,
  },
  stoneImpact: {
    maxRadius: 250,
    hearRadius: 550,
    speed: 300,
    color: 'cyan',
    tags: ['ping', 'impact'],
  },
  shockwave: { maxRadius: 180, hearRadius: 400, speed: 600, color: 'red', tags: ['shockwave'] },
  hunterStep: { maxRadius: 80, hearRadius: 80, speed: 200, color: 'orange', tags: ['hunter'] },
  hunterStepMetal: {
    maxRadius: 120,
    hearRadius: 120,
    speed: 220,
    color: 'orange',
    tags: ['hunter'],
  },
  listenerScream: {
    maxRadius: 900,
    hearRadius: 1400,
    speed: 500,
    color: 'red',
    tags: ['scream'],
  },
  beacon: { maxRadius: 500, hearRadius: 1000, speed: 150, color: 'green', tags: ['beacon'] },
  wallBump: {
    maxRadius: 100,
    hearRadius: 200,
    speed: 250,
    color: 'white',
    tags: ['footstep', 'impact'],
  },
  coreHum: { maxRadius: 40, hearRadius: 40, speed: 120, color: 'cyan', tags: ['ambient'] },
  // Phase 28 carrier pressure: cores you carry hum; with enough to win, 1.4x louder.
  carriedHum: { maxRadius: 60, hearRadius: 220, speed: 160, color: 'cyan', tags: ['carry'] },
  // Phase 29: a trap springing shut. Loud: it lights the area and hunters come.
  trapSnap: { maxRadius: 260, hearRadius: 600, speed: 420, color: 'red', tags: ['impact'] },
  carriedHumHeavy: { maxRadius: 84, hearRadius: 308, speed: 160, color: 'cyan', tags: ['carry'] },
  // Phase 17 sound cover: machine noise no hunter reacts to, lighting the walls nearby.
  ventHum: { maxRadius: 150, hearRadius: 150, speed: 110, color: 'dim', tags: ['ambient'] },
  drip: { maxRadius: 70, hearRadius: 70, speed: 160, color: 'dim', tags: ['ambient'] },
} as const satisfies Record<string, SoundKindDef>;

export type SoundKindId = keyof typeof SOUND_KINDS;
