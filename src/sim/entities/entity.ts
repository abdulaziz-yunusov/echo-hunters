/** Identifies an entity across systems, events and the network. */
export type EntityId = number;

/** The player in solo play, and the duel host. */
export const PLAYER_ID: EntityId = 1;
/** The duel client (the player who joined). Ids are the same on both machines. */
export const GUEST_ID: EntityId = 2;
