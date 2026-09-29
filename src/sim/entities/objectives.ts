import { GAME } from '@/config/game';
import type { Vec2 } from '@/core/geometry';

/** A Signal Core (GDD §5). Hums quietly until someone picks it up. */
export interface Core {
  readonly id: number;
  readonly x: number;
  readonly y: number;
  collected: boolean;
  /** Seconds until the next hum. */
  humTimer: number;
}

/** The Extraction Beacon. Silent until every core is collected, then loud. */
export interface Beacon {
  readonly x: number;
  readonly y: number;
  active: boolean;
  /** Seconds until the next pulse (while active). */
  pulseTimer: number;
}

/** Cores hum in turn, not all at once, so each one can be told apart. */
export function createCores(positions: readonly Vec2[]): Core[] {
  const interval = GAME.objectives.coreHumInterval;
  return positions.map((p, i) => ({
    id: i + 1,
    x: p.x,
    y: p.y,
    collected: false,
    humTimer: (interval * (i + 1)) / positions.length,
  }));
}

export function createBeacon(position: Vec2): Beacon {
  return { x: position.x, y: position.y, active: false, pulseTimer: 0 };
}
