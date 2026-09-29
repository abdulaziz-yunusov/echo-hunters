import { GAME } from '@/config/game';
import type { EntityId } from './entity';

/** The Echo. Plain data: systems update it, renderers read it. */
export interface Player {
  readonly id: EntityId;
  /** Position (world px) now and at the previous tick, for smooth drawing. */
  x: number;
  y: number;
  prevX: number;
  prevY: number;
  /** Actual velocity after collisions (px/s). */
  vx: number;
  vy: number;
  readonly radius: number;
  sneaking: boolean;
  /** Walking distance since the last footstep (px). */
  stride: number;
  /** Pressed against a wall during the last tick. */
  touchingWall: boolean;
  /** Seconds until another wall bump can make a sound. */
  bumpCooldown: number;
}

export function createPlayer(id: EntityId, x: number, y: number): Player {
  return {
    id,
    x,
    y,
    prevX: x,
    prevY: y,
    vx: 0,
    vy: 0,
    radius: GAME.player.radius,
    sneaking: false,
    stride: 0,
    touchingWall: false,
    bumpCooldown: 0,
  };
}
