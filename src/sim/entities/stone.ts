import type { EntityId } from './entity';

/** A decoy stone in flight. Silent until it lands. */
export interface Stone {
  readonly id: number;
  /** Who threw it. */
  readonly owner: EntityId;
  x: number;
  y: number;
  prevX: number;
  prevY: number;
  /** px/s */
  vx: number;
  vy: number;
  /** Seconds until it reaches the aim point (if no wall stops it first). */
  timeLeft: number;
}
