import type { SoundKindId } from '@/config/sounds';
import type { PickupTypeId, ToolId } from '@/config/pickups';
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
  /** A hunter came close and the player got away unhurt (scored = counted toward points). */
  closeCall: { hunterId: EntityId; x: number; y: number; scored: boolean };
  pickupCollected: { pickupId: number; type: PickupTypeId; x: number; y: number; by: EntityId };
  roundEnded: { status: Exclude<RoundStatus, 'playing'>; time: number };
  /** Duel client: asking the host for something contested. */
  takeRequested: { kind: TakeKind; id: number };
  /** Duel client: "I'm at the beacon with enough cores" (the host starts the extraction). */
  extractRequested: undefined;
  /** Duel client: "I've left the beacon." */
  extractLeft: undefined;
  /** Duel: `by` started extracting (Phase 28). */
  extractStarted: { by: EntityId };
  /** Duel: `by`'s extraction was cut short (hit, stepped away, lost the cores). */
  extractCancelled: { by: EntityId };
  /** Duel (Phase 29): this machine's player used the tool in hand. */
  toolUsed: { by: EntityId; tool: ToolId; x: number; y: number; trapId?: number };
  /** Duel: picking up a tool swapped out the old one, now on the floor. */
  toolDropped: { by: EntityId; pickup: { id: number; type: ToolId; x: number; y: number } };
  /** Duel: `victim` walked into `owner`'s trap. */
  trapFired: { owner: EntityId; victim: EntityId; id: number; x: number; y: number };
  /** Duel: the rival's flare shows where this machine's player is. */
  flareSeen: undefined;
  /** Duel: `by` took a core that `from` had dropped. */
  coreStolen: { by: EntityId; from: EntityId; x: number; y: number };
  /** Duel: a player's carried cores fell to the floor as new cores. */
  coresDropped: { by: EntityId; cores: { id: number; x: number; y: number }[] };
  /** Duel: someone extracted with enough cores. */
  duelEnded: { winner: EntityId };
}
