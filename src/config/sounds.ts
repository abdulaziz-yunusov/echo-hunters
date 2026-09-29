import type { ColorKey } from './theme';

/**
 * Tags describe what a sound "is". Hunters react to tags (see hunters.ts),
 * so a new sound only needs the right tags to be heard correctly.
 */
export type SoundTag =
  'footstep' | 'ping' | 'impact' | 'shockwave' | 'hunter' | 'scream' | 'beacon' | 'ambient';

export interface SoundKindDef {
  /** px */
  maxRadius: number;
  /** px per second */
  speed: number;
  color: ColorKey;
  tags: readonly SoundTag[];
}

/** GDD §4 sound table. */
export const SOUND_KINDS = {
  step: { maxRadius: 60, speed: 200, color: 'dim', tags: ['footstep'] },
  ping: { maxRadius: 400, speed: 350, color: 'cyan', tags: ['ping'] },
  stoneImpact: { maxRadius: 250, speed: 300, color: 'cyan', tags: ['ping', 'impact'] },
  shockwave: { maxRadius: 180, speed: 600, color: 'red', tags: ['shockwave'] },
  hunterStep: { maxRadius: 80, speed: 200, color: 'orange', tags: ['hunter'] },
  listenerScream: { maxRadius: 900, speed: 500, color: 'red', tags: ['scream'] },
  beacon: { maxRadius: 500, speed: 150, color: 'green', tags: ['beacon'] },
  wallBump: { maxRadius: 100, speed: 250, color: 'white', tags: ['footstep', 'impact'] },
  coreHum: { maxRadius: 40, speed: 120, color: 'cyan', tags: ['ambient'] },
} as const satisfies Record<string, SoundKindDef>;

export type SoundKindId = keyof typeof SOUND_KINDS;
