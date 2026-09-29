import type { PickupTypeId } from '@/config/pickups';

/** Something lying on the floor to pick up (GDD §5). Seen only when sound touches it. */
export interface Pickup {
  readonly id: number;
  readonly type: PickupTypeId;
  readonly x: number;
  readonly y: number;
  collected: boolean;
}
