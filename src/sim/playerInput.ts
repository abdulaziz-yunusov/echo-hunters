import type { Vec2 } from '@/core/geometry';

/**
 * What one player asks for during one tick, in world terms. Built from the
 * local InputFrame, or received over the network, or replayed from a recording.
 */
export interface PlayerInput {
  /** Movement direction; length 0..1. */
  moveX: number;
  moveY: number;
  sneak: boolean;
  /** Pressed this tick. */
  ping: boolean;
  /** The ping key is down at the end of this tick (held to charge a beam). */
  pingHeld: boolean;
  throwStone: boolean;
  shockwave: boolean;
  /** Use the duel tool in hand (Phase 29). */
  useTool: boolean;
  /** Aim point in world px, or null when there is no pointer (touch). */
  aim: Vec2 | null;
}

export const IDLE_INPUT: Readonly<PlayerInput> = {
  moveX: 0,
  moveY: 0,
  sneak: false,
  ping: false,
  pingHeld: false,
  throwStone: false,
  shockwave: false,
  useTool: false,
  aim: null,
};
