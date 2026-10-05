import type { PickupTypeId } from '@/config/pickups';
import type { EntityId } from './entity';

/** Something lying on the floor to pick up (GDD §5). Seen only when sound touches it. */
export interface Pickup {
  readonly id: number;
  readonly type: PickupTypeId;
  readonly x: number;
  readonly y: number;
  collected: boolean;
  /**
   * Duel: a tool swapped out (Phase 29) can't be picked up again by the
   * player who dropped it until they have stepped away from it.
   */
  lockedFor?: EntityId;
}
