import type { SoundKindId } from '@/config/sounds';
import type { EntityId } from './entities/entity';
import type { Player } from './entities/player';
import type { SoundWave } from './sound/soundWave';
import type { WallGeometry } from './world/edges';
import type { MapLayout } from './world/mapGen';

/** Everything that describes one round. Plain data, the single source of truth. */
export interface GameState {
  /** Simulation seconds since the round started. */
  time: number;
  tick: number;
  layout: MapLayout;
  walls: WallGeometry;
  player: Player;
  /** Sound rings currently expanding. */
  waves: SoundWave[];
  nextWaveId: number;
}

/** What systems may use: the state plus the ways to affect the world. */
export interface SimContext {
  readonly state: GameState;
  /**
   * Make a noise: starts a sound wave and announces it. The origin must be in
   * open floor (not exactly on a wall face), e.g. a wall bump 1 px off the wall.
   */
  emitSound(kind: SoundKindId, x: number, y: number, owner: EntityId | null): void;
}
