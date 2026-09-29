import type { SoundKindId } from '@/config/sounds';
import type { EntityId } from './entities/entity';
import type { SoundWave } from './sound/soundWave';

export interface SoundEmitted {
  kind: SoundKindId;
  x: number;
  y: number;
  /** Who made it (hunters ignore their own sounds); null for the world (beacon, cores). */
  owner: EntityId | null;
  /** Simulation time (s). */
  time: number;
  /** The ring this sound created; it keeps growing in GameState.waves. */
  wave: SoundWave;
}

/**
 * Everything the simulation announces. Render, audio, network and debug
 * tools subscribe; the simulation never knows who is listening.
 */
export interface GameEvents {
  soundEmitted: SoundEmitted;
}
