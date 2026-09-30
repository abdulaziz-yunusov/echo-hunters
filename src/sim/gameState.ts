import type { HearingModel } from '@/config/game';
import type { SoundKindId } from '@/config/sounds';
import type { EventBus } from '@/core/events';
import type { Vec2 } from '@/core/geometry';
import type { Rng } from '@/core/rng';
import type { EntityId } from './entities/entity';
import type { Hunter } from './entities/hunter';
import type { Beacon, Core } from './entities/objectives';
import type { Pickup } from './entities/pickup';
import type { Player } from './entities/player';
import type { Stone } from './entities/stone';
import type { GameEvents } from './events';
import type { PendingHearing } from './sound/hearing';
import type { SoundWave } from './sound/soundWave';
import type { WallGeometry } from './world/edges';
import type { MapLayout } from './world/mapGen';

/** Tunables a level may change (LevelDef.overrides). */
export interface LevelRules {
  pingCooldown: number;
}

/** How a round stands: running, or over and why ('lost' = the duel rival extracted first). */
export type RoundStatus = 'playing' | 'extracted' | 'dead' | 'lost';

/**
 * Who runs what. Solo: everything. Duel host: everything, and it is the
 * referee for the client. Duel client: only its own player; it asks the
 * host for anything contested and copies the host's hunters and objectives.
 */
export type SimMode = 'solo' | 'host' | 'client';

/** Something that can be grabbed by only one player. */
export type TakeKind = 'core' | 'pickup';

/** Duel-only rules and bookkeeping (GDD §8). */
export interface DuelState {
  coresToWin: number;
  hitsToDrop: number;
  /** Hits taken since the last drop, by player id. */
  hits: Record<number, number>;
  winner: EntityId | null;
  /** Client: takes asked of the host, not answered yet ("core:3"). */
  pending: string[];
  /** Client: extraction asked of the host, not answered yet. */
  extractPending: boolean;
}

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
  /** The player on this machine. */
  player: Player;
  /** Duel: the other player, positioned from the network (never controlled here). */
  rival: Player | null;
  mode: SimMode;
  duel: DuelState | null;
  hunters: Hunter[];
  cores: Core[];
  beacon: Beacon;
  pickups: Pickup[];
  /** Decoy stones in flight. */
  stones: Stone[];
  nextStoneId: number;
  /** Sound rings currently expanding. */
  waves: SoundWave[];
  nextWaveId: number;
  /** Gameplay randomness (AI choices). Separate from the map stream, see core/rng. */
  rng: Rng;
  /** Sounds on their way to hunters (see sound/hearing.ts). */
  hearings: PendingHearing[];
  /** Level-specific rule values (GAME defaults plus the level's overrides). */
  rules: LevelRules;
  /** How hunters hear (GAME.hearing.model by default; debug can switch it live). */
  hearingModel: HearingModel;
  stats: {
    /** Hunters stunned this round (Phase 7). */
    huntersStunned: number;
    /** Close calls that scored this round (Phase 15). */
    closeCalls: number;
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
  emitSound(
    kind: SoundKindId,
    x: number,
    y: number,
    owner: EntityId | null,
    /** Where hunters that hear it should go (default: the origin). */
    focus?: Vec2,
  ): void;
}
