import { SOUND_KINDS, type SoundKindDef, type SoundKindId } from '@/config/sounds';
import { inSector, pointInPolygon, type Sector, type Vec2 } from '@/core/geometry';
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
  /**
   * Where a hunter that hears it goes. Usually the origin; a Listener's
   * scream points at the noise that set it off.
   */
  readonly focusX: number;
  readonly focusY: number;
  /** A directional sound's wedge (Phase 18 beam); null = all around. */
  readonly arc: Sector | null;
  /**
   * Made by Decoy Steps (Phase 29): it sounds like its owner's footstep to
   * everyone, but nobody walked there, so it leaves no trail.
   */
  readonly decoy: boolean;
}

/** Optional details of a new sound. */
export interface SoundOptions {
  /** Where hunters that hear it should go (default: the origin). */
  focus?: Vec2;
  /** Aim of a directional sound kind (radians); ignored by the others. */
  dir?: number;
  /** A fake footstep from Decoy Steps. */
  decoy?: boolean;
  /** The round's sound rules (Phase 30): × on the ring radius and on the speed. */
  scale?: { rings: number; speed: number };
}

export function createWave(
  walls: WallGeometry,
  id: number,
  kind: SoundKindId,
  x: number,
  y: number,
  owner: EntityId | null,
  time: number,
  { focus = { x, y }, dir = 0, decoy = false, scale = { rings: 1, speed: 1 } }: SoundOptions = {},
): SoundWave {
  const def = SOUND_KINDS[kind];
  const halfAngle = arcHalfAngle(kind);
  const arc = halfAngle === null ? null : { dir, halfAngle };
  return {
    id,
    kind,
    x,
    y,
    owner,
    startTime: time,
    maxRadius: def.maxRadius * scale.rings,
    speed: def.speed * scale.speed,
    radius: 0,
    polygon: visibilityPolygon(walls, x, y, def.maxRadius * scale.rings, arc),
    focusX: focus.x,
    focusY: focus.y,
    arc,
    decoy,
  };
}

/** Half the width of a sound kind's wedge (radians); null if it spreads all around. */
export function arcHalfAngle(kind: SoundKindId): number | null {
  const { arc }: SoundKindDef = SOUND_KINDS[kind];
  return arc === undefined ? null : (arc * Math.PI) / 360;
}

/** True if (x, y) lies in the direction the wave spreads (always, for a round one). */
export function waveFaces(wave: SoundWave, x: number, y: number): boolean {
  return wave.arc === null || inSector(wave.arc, x - wave.x, y - wave.y);
}

/**
 * Did the ring's front pass over (x, y) during the last tick, with nothing
 * blocking the way? That is when a small thing standing there is seen.
 * (Strict, so a sound's own source, at distance 0, counts on its first tick.)
 */
export function frontPassedOver(wave: SoundWave, x: number, y: number, dt: number): boolean {
  const d = Math.hypot(x - wave.x, y - wave.y);
  if (d > wave.radius || d < wave.radius - wave.speed * dt) return false;
  return pointInPolygon(x, y, wave.polygon);
}

/** Grow every wave by one tick. */
export function growWaves(waves: readonly SoundWave[], dt: number): void {
  for (const w of waves) w.radius = Math.min(w.maxRadius, w.radius + w.speed * dt);
}

/** Waves still growing (the ones at full size are done). */
export function pruneWaves(waves: readonly SoundWave[]): SoundWave[] {
  return waves.filter((w) => w.radius < w.maxRadius);
}
