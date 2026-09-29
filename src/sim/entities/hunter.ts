import { HUNTER_COMMON, type HunterTypeId } from '@/config/hunters';
import type { Vec2 } from '@/core/geometry';
import type { MachineState } from '@/core/fsm';
import type { EntityId } from './entity';

/** Hunter AI states (GDD §5 state machine). */
export type HunterStateId = 'idle' | 'investigate' | 'search' | 'attack' | 'stunned';

/** A Hunter. Blind: it finds the player only by sound and by touch. Plain data. */
export interface Hunter extends MachineState<HunterStateId> {
  readonly id: EntityId;
  readonly type: HunterTypeId;
  x: number;
  y: number;
  prevX: number;
  prevY: number;
  readonly radius: number;
  /** Where the current state is heading (sound origin, search point, stroll target). */
  goal: Vec2 | null;
  /** Waypoints still to walk toward the goal (world px). */
  path: Vec2[];
  /** A sound heard since the brain last ran; the brain reacts, then clears it. */
  heard: Vec2 | null;
  /** The last sound heard (search center, debug). */
  lastHeard: Vec2 | null;
  /** Center of the current search. */
  searchCenter: Vec2 | null;
  /** Seconds left to stand still before the next stroll. */
  pause: number;
  /** Seconds without progress toward the goal. */
  stuckTime: number;
  /** Walking distance since the last footstep (px). */
  stride: number;
  /** Facing angle (radians), for the Listener's slow turn. */
  facing: number;
}

export function createHunter(id: EntityId, type: HunterTypeId, x: number, y: number): Hunter {
  return {
    id,
    type,
    state: 'idle',
    stateTime: 0,
    x,
    y,
    prevX: x,
    prevY: y,
    radius: HUNTER_COMMON.radius,
    goal: null,
    path: [],
    heard: null,
    lastHeard: null,
    searchCenter: null,
    pause: 0,
    stuckTime: 0,
    stride: 0,
    facing: 0,
  };
}
