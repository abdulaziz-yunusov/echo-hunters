import type { SoundKindId } from '@/config/sounds';
import type { PickupTypeId } from '@/config/pickups';
import type { EntityId } from './entities/entity';
import type { RoundStatus, TakeKind } from './gameState';
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
  coreCollected: { coreId: number; by: EntityId; x: number; y: number };
  beaconActivated: { x: number; y: number };
  playerHit: { x: number; y: number; hp: number; by: EntityId; target: EntityId; hits: number };
  hunterHeard: { hunterId: EntityId; x: number; y: number };
  stoneThrown: { x: number; y: number; toX: number; toY: number };
  hunterStunned: { hunterId: EntityId; x: number; y: number; scored: boolean };
  pickupCollected: { pickupId: number; type: PickupTypeId; x: number; y: number; by: EntityId };
  roundEnded: { status: Exclude<RoundStatus, 'playing'>; time: number };
  /** Duel client: asking the host for something contested. */
  takeRequested: { kind: TakeKind; id: number };
  /** Duel client: asking the host to confirm an extraction. */
  extractRequested: undefined;
  /** Duel: a player's carried cores fell to the floor as new cores. */
  coresDropped: { by: EntityId; cores: { id: number; x: number; y: number }[] };
  /** Duel: someone extracted with enough cores. */
  duelEnded: { winner: EntityId };
}
