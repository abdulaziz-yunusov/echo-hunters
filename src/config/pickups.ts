/** GDD §5 pickups (Signal Cores are objectives, see GAME.objectives). */
export const PICKUP_TYPES = {
  /** +2 decoy stones. */
  stoneBag: { stones: 2 },
  /** +1 HP; only picked up when hurt, so it is never wasted. */
  heart: { hp: 1 },
  /** Seconds of silent movement at full speed. */
  silentBoots: { duration: 8 },
  // Duel tools (Phase 29): held in the one tool slot, used with useTool. See TOOLS.
  trapKit: { tool: true },
  flare: { tool: true },
  decoySteps: { tool: true },
} as const;

export type PickupTypeId = keyof typeof PICKUP_TYPES;

/** Duel tools (Phase 29): each map has GAME.duel.toolsPerMap of them, chosen by the seed. */
export const DUEL_TOOLS = ['trapKit', 'flare', 'decoySteps'] as const;

export type ToolId = (typeof DUEL_TOOLS)[number];

export function isTool(type: PickupTypeId): type is ToolId {
  return (DUEL_TOOLS as readonly string[]).includes(type);
}

/**
 * - trapKit: placed silently at your feet, unseen by the rival. When the
 *   rival comes within triggerRadius it snaps (`trapSnap`, loud) and shows
 *   you their outline for revealSeconds. Never fires on its owner; at most
 *   maxPerPlayer each, the oldest goes.
 * - flare: shows you the rival's outline wherever they are, through walls,
 *   for revealSeconds. They hear a hiss and see YOU ARE SEEN.
 * - decoySteps: for `seconds`, fake footsteps walk away from where you stand
 *   toward your aim, at walking pace; your own steps are silent meanwhile.
 */
export const TOOLS = {
  trapKit: { label: 'TRAP KIT', triggerRadius: 16, maxPerPlayer: 2, revealSeconds: 1 },
  flare: { label: 'FLARE', revealSeconds: 1 },
  decoySteps: { label: 'DECOY STEPS', seconds: 3 },
} as const satisfies Record<ToolId, { label: string; [tuning: string]: string | number }>;
