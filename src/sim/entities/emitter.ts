import type { EmitterTypeId } from '@/config/emitters';

/** A vent or dripping pipe (Phase 17): noise on a cycle that hides footsteps. Plain data. */
export interface Emitter {
  readonly id: number;
  readonly type: EmitterTypeId;
  readonly x: number;
  readonly y: number;
  /** Seconds until the next active spell starts. */
  timer: number;
  /** Seconds left of the current spell; > 0 means it is making noise (and masking). */
  activeLeft: number;
}
