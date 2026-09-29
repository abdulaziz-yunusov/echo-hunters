import type { HearingModel } from '@/config/game';
import type { SoundKindId } from '@/config/sounds';
import type { EventBus } from '@/core/events';
import type { Rng } from '@/core/rng';
import type { EntityId } from './entities/entity';
import type { Hunter } from './entities/hunter';
import type { Beacon, Core } from './entities/objectives';
import type { Player } from './entities/player';
import type { GameEvents } from './events';
import type { PendingHearing } from './sound/hearing';
import type { SoundWave } from './sound/soundWave';
import type { WallGeometry } from './world/edges';
import type { MapLayout } from './world/mapGen';

/** How a round stands: running, or over and why. */
export type RoundStatus = 'playing' | 'extracted' | 'dead';

/** Everything that describes one round. Plain data, the single source of truth. */
export interface GameState {
  /** Level number, from 1. */
  level: number;
  status: RoundStatus;
  /** Simulation seconds since the round started. */
  time: number;
  tick: number;
  layout: MapLayout;
  walls: WallGeometry;
  player: Player;
  hunters: Hunter[];
  cores: Core[];
  beacon: Beacon;
  /** Sound rings currently expanding. */
  waves: SoundWave[];
  nextWaveId: number;
  /** Gameplay randomness (AI choices). Separate from the map stream, see core/rng. */
  rng: Rng;
  /** Sounds on their way to hunters (see sound/hearing.ts). */
  hearings: PendingHearing[];
  /** How hunters hear (GAME.hearing.model by default; debug can switch it live). */
  hearingModel: HearingModel;
  stats: {
    /** Hunters stunned this round (Phase 7). */
    huntersStunned: number;
  };
}

/** What systems may use: the state plus the ways to affect the world. */
export interface SimContext {
  readonly state: GameState;
  /** Announce something that happened (see GameEvents). */
  readonly events: Pick<EventBus<GameEvents>, 'emit'>;
  /**
   * Make a noise: starts a sound wave and announces it. The origin must be in
   * open floor (not exactly on a wall face), e.g. a wall bump 1 px off the wall.
   */
  emitSound(kind: SoundKindId, x: number, y: number, owner: EntityId | null): void;
}
