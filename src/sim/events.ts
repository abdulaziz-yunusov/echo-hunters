import type { SoundKindId } from '@/config/sounds';
import type { EntityId } from './entities/entity';

export interface SoundEmitted {
  kind: SoundKindId;
  x: number;
  y: number;
  /** Who made it (hunters ignore their own sounds); null for the world (beacon, cores). */
  owner: EntityId | null;
  /** Simulation time (s). */
  time: number;
}

/**
 * Everything the simulation announces. Render, audio, network and debug
 * tools subscribe; the simulation never knows who is listening.
 */
export interface GameEvents {
  soundEmitted: SoundEmitted;
}
