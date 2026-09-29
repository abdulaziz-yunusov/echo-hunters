/** GDD §5 pickups (Signal Cores are objectives, see GAME.objectives). */
export const PICKUP_TYPES = {
  stoneBag: { stones: 2 },
  heart: { hp: 1 },
  silentBoots: { duration: 8 },
} as const;

export type PickupTypeId = keyof typeof PICKUP_TYPES;
