/** GDD §5 pickups (Signal Cores are objectives, see GAME.objectives). */
export const PICKUP_TYPES = {
  /** +2 decoy stones. */
  stoneBag: { stones: 2 },
  /** +1 HP; only picked up when hurt, so it is never wasted. */
  heart: { hp: 1 },
  /** Seconds of silent movement at full speed. */
  silentBoots: { duration: 8 },
} as const;

export type PickupTypeId = keyof typeof PICKUP_TYPES;
