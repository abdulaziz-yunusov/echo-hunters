import type { Segment } from '@/core/geometry';
import { SpatialGrid } from '@/core/spatialGrid';
import type { TileMap } from './tileMap';

/** One tile side between a wall and a floor. The unit that gets revealed and fades. */
export interface WallEdge extends Segment {
  /** Unit normal pointing from the wall into the floor. */
  nx: number;
  ny: number;
}

/**
 * A straight run of adjacent, same-facing edges merged into one segment.
 * Rays are cast against these (far fewer than edges).
 */
export interface WallSegment extends WallEdge {
  /** The run covers edges[firstEdge .. firstEdge + edgeCount). */
  firstEdge: number;
  edgeCount: number;
}

export interface WallGeometry {
  edges: WallEdge[];
  segments: WallSegment[];
  edgeGrid: SpatialGrid;
  segmentGrid: SpatialGrid;
}

/** Spatial index cell size, in tiles. */
const GRID_CELL_TILES = 4;

/**
 * Derive wall geometry from the tiles. Walls are static, so this runs once
 * per map. Only wall sides that touch floor produce edges: those are the
 * only sides a sound can ever reach.
 */
export function buildWallGeometry(map: TileMap): WallGeometry {
  const edges: WallEdge[] = [];
  const segments: WallSegment[] = [];
  const ts = map.tileSize;

  const emitRun = (
    run: { from: number; to: number },
    line: number,
    horizontal: boolean,
    nx: number,
    ny: number,
  ): void => {
    const firstEdge = edges.length;
    for (let i = run.from; i < run.to; i++) {
      edges.push(
        horizontal
          ? { ax: i * ts, ay: line, bx: (i + 1) * ts, by: line, nx, ny }
          : { ax: line, ay: i * ts, bx: line, by: (i + 1) * ts, nx, ny },
      );
    }
    segments.push(
      horizontal
        ? {
            ax: run.from * ts,
            ay: line,
            bx: run.to * ts,
            by: line,
            nx,
            ny,
            firstEdge,
            edgeCount: run.to - run.from,
          }
        : {
            ax: line,
            ay: run.from * ts,
            bx: line,
            by: run.to * ts,
            nx,
            ny,
            firstEdge,
            edgeCount: run.to - run.from,
          },
    );
  };

  // Horizontal edges: wall tile with floor above (facing up) or below (facing down).
  for (const dy of [-1, 1]) {
    for (let ty = 0; ty < map.height; ty++) {
      const line = (dy < 0 ? ty : ty + 1) * ts;
      let from = -1;
      for (let tx = 0; tx <= map.width; tx++) {
        const isEdge = tx < map.width && map.isWall(tx, ty) && map.isFloor(tx, ty + dy);
        if (isEdge && from < 0) from = tx;
        if (!isEdge && from >= 0) {
          emitRun({ from, to: tx }, line, true, 0, dy);
          from = -1;
        }
      }
    }
  }

  // Vertical edges: wall tile with floor to the left (facing left) or right.
  for (const dx of [-1, 1]) {
    for (let tx = 0; tx < map.width; tx++) {
      const line = (dx < 0 ? tx : tx + 1) * ts;
      let from = -1;
      for (let ty = 0; ty <= map.height; ty++) {
        const isEdge = ty < map.height && map.isWall(tx, ty) && map.isFloor(tx + dx, ty);
        if (isEdge && from < 0) from = ty;
        if (!isEdge && from >= 0) {
          emitRun({ from, to: ty }, line, false, dx, 0);
          from = -1;
        }
      }
    }
  }

  const cell = GRID_CELL_TILES * ts;
  return {
    edges,
    segments,
    edgeGrid: SpatialGrid.fromSegments(edges, cell, map.worldWidth, map.worldHeight),
    segmentGrid: SpatialGrid.fromSegments(segments, cell, map.worldWidth, map.worldHeight),
  };
}
