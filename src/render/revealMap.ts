import { pointSegmentDistance } from '@/core/geometry';
import type { SoundWave } from '@/sim/sound/soundWave';
import type { WallGeometry } from '@/sim/world/edges';
import { hasLineOfSight } from '@/sim/world/visibility';

/** Points along an edge tested for visibility (fractions of its length). */
const SAMPLES = [0.1, 0.5, 0.9];
/** Test points sit this far in front of the wall, so the wall itself never blocks them (px). */
const FACE_OFFSET = 0.5;

interface TrackedWave {
  wave: SoundWave;
  /** Visible edge ids, nearest first, and their distances. */
  edges: Int32Array;
  distances: Float32Array;
  /** Edges before this index are already revealed. */
  cursor: number;
}

/**
 * When each wall edge was last touched by a sound ring. Purely visual, so it
 * lives outside the simulation; it reads the simulation's waves.
 *
 * Work per wave happens once, when the wave starts: the edges it can see
 * are listed nearest first. After that, revealing is just advancing a cursor
 * while the ring grows.
 */
export class RevealMap {
  /** Simulation time each edge was last revealed; -Infinity = never. */
  readonly revealTime: Float64Array;
  private readonly walls: WallGeometry;
  private tracked: TrackedWave[] = [];

  constructor(walls: WallGeometry) {
    this.walls = walls;
    this.revealTime = new Float64Array(walls.edges.length).fill(-Infinity);
  }

  /** Start tracking a new wave. */
  addWave(wave: SoundWave): void {
    const { edges, edgeGrid } = this.walls;
    const found: { id: number; distance: number }[] = [];

    for (const id of edgeGrid.queryCircle(wave.x, wave.y, wave.maxRadius)) {
      const e = edges[id];
      // Back faces point away from the sound and can never be hit.
      const mx = (e.ax + e.bx) / 2;
      const my = (e.ay + e.by) / 2;
      if ((wave.x - mx) * e.nx + (wave.y - my) * e.ny <= 0) continue;

      const distance = pointSegmentDistance(wave.x, wave.y, e);
      if (distance > wave.maxRadius) continue;
      if (!this.isVisible(wave, e)) continue;
      found.push({ id, distance });
    }

    found.sort((a, b) => a.distance - b.distance);
    this.tracked.push({
      wave,
      edges: Int32Array.from(found, (f) => f.id),
      distances: Float32Array.from(found, (f) => f.distance),
      cursor: 0,
    });
  }

  /** Reveal edges the rings have reached by `now`. Call once per simulation tick. */
  update(now: number): void {
    for (const t of this.tracked) {
      while (t.cursor < t.edges.length && t.distances[t.cursor] <= t.wave.radius) {
        this.revealTime[t.edges[t.cursor]] = now;
        t.cursor++;
      }
    }
    this.tracked = this.tracked.filter(
      (t) => t.cursor < t.edges.length && t.wave.radius < t.wave.maxRadius,
    );
  }

  /** Waves still revealing (for tests and debug). */
  get activeWaves(): number {
    return this.tracked.length;
  }

  private isVisible(wave: SoundWave, e: WallGeometry['edges'][number]): boolean {
    for (const f of SAMPLES) {
      const px = e.ax + (e.bx - e.ax) * f + e.nx * FACE_OFFSET;
      const py = e.ay + (e.by - e.ay) * f + e.ny * FACE_OFFSET;
      if (hasLineOfSight(this.walls, wave.x, wave.y, px, py)) return true;
    }
    return false;
  }
}
