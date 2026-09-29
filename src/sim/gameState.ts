import type { SoundKindId } from '@/config/sounds';
import type { EntityId } from './entities/entity';
import type { Player } from './entities/player';
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
}

/** What systems may use: the state plus the ways to affect the world. */
export interface SimContext {
  readonly state: GameState;
  /** Make a noise. Everything that can hear or show sound reacts through this. */
  emitSound(kind: SoundKindId, x: number, y: number, owner: EntityId | null): void;
}
