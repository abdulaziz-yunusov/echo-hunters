import { SOUND_KINDS, type SoundKindId } from '@/config/sounds';
import type { EntityId } from '../entities/entity';
import type { WallGeometry } from '../world/edges';
import { visibilityPolygon } from '../world/visibility';

/** An expanding ring of sound (GDD §4). Walls block it; it never passes through them. */
export interface SoundWave {
  readonly id: number;
  readonly kind: SoundKindId;
  readonly x: number;
  readonly y: number;
  /** Who made it; null for the world (beacon, cores). */
  readonly owner: EntityId | null;
  /** Simulation time it started (s). */
  readonly startTime: number;
  readonly maxRadius: number;
  /** px per second. */
  readonly speed: number;
  /** Current ring radius (px). */
  radius: number;
  /** Area the wave can ever reach: visibility polygon, x0, y0, x1, y1, … */
  readonly polygon: Float32Array;
}

export function createWave(
  walls: WallGeometry,
  id: number,
  kind: SoundKindId,
  x: number,
  y: number,
  owner: EntityId | null,
  time: number,
): SoundWave {
  const def = SOUND_KINDS[kind];
  return {
    id,
    kind,
    x,
    y,
    owner,
    startTime: time,
    maxRadius: def.maxRadius,
    speed: def.speed,
    radius: 0,
    polygon: visibilityPolygon(walls, x, y, def.maxRadius),
  };
}

/** Grow every wave; drop the ones that reached their full size. */
export function updateWaves(waves: SoundWave[], dt: number): SoundWave[] {
  for (const w of waves) w.radius = Math.min(w.maxRadius, w.radius + w.speed * dt);
  return waves.filter((w) => w.radius < w.maxRadius);
}
