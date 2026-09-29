import { segmentBounds, type Bounds, type Segment } from './geometry';

/**
 * Uniform grid over items that never move (wall edges, wall segments), for
 * fast "what is near this area" queries. Built once, stored compactly: each
 * cell lists the ids of the items whose bounds touch it.
 */
export class SpatialGrid {
  readonly cellSize: number;
  readonly cols: number;
  readonly rows: number;

  /** Items of cell c are cellItems[cellStart[c] .. cellStart[c + 1]). */
  private readonly cellStart: Int32Array;
  private readonly cellItems: Int32Array;
  /** Per-item "last seen in query #" so an item spanning several cells is returned once. */
  private readonly seen: Uint32Array;
  private queryId = 0;

  constructor(cellSize: number, width: number, height: number, items: readonly Bounds[]) {
    this.cellSize = cellSize;
    this.cols = Math.max(1, Math.ceil(width / cellSize));
    this.rows = Math.max(1, Math.ceil(height / cellSize));
    this.seen = new Uint32Array(items.length);

    // Pass 1: count items per cell. Pass 2: fill.
    const counts = new Int32Array(this.cols * this.rows);
    items.forEach((b) => this.forCells(b, (c) => counts[c]++));

    this.cellStart = new Int32Array(counts.length + 1);
    for (let c = 0; c < counts.length; c++) this.cellStart[c + 1] = this.cellStart[c] + counts[c];

    this.cellItems = new Int32Array(this.cellStart[counts.length]);
    const fill = this.cellStart.slice(0, counts.length);
    items.forEach((b, id) => this.forCells(b, (c) => (this.cellItems[fill[c]++] = id)));
  }

  static fromSegments(
    segments: readonly Segment[],
    cellSize: number,
    width: number,
    height: number,
  ): SpatialGrid {
    return new SpatialGrid(cellSize, width, height, segments.map(segmentBounds));
  }

  /**
   * Ids of items whose cells overlap the query area (a superset of exact
   * hits; callers do the precise test). Each id appears once.
   */
  query(area: Bounds, out: number[] = []): number[] {
    this.queryId = (this.queryId + 1) >>> 0;
    if (this.queryId === 0) {
      this.seen.fill(0);
      this.queryId = 1;
    }
    this.forCells(area, (c) => {
      for (let k = this.cellStart[c]; k < this.cellStart[c + 1]; k++) {
        const id = this.cellItems[k];
        if (this.seen[id] !== this.queryId) {
          this.seen[id] = this.queryId;
          out.push(id);
        }
      }
    });
    return out;
  }

  /** Items within `radius` of a point (by cell), e.g. walls a sound might reach. */
  queryCircle(x: number, y: number, radius: number, out: number[] = []): number[] {
    return this.query(
      { minX: x - radius, minY: y - radius, maxX: x + radius, maxY: y + radius },
      out,
    );
  }

  private forCells(b: Bounds, visit: (cell: number) => void): void {
    const c0 = this.clampCol(b.minX);
    const c1 = this.clampCol(b.maxX);
    const r0 = this.clampRow(b.minY);
    const r1 = this.clampRow(b.maxY);
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) visit(r * this.cols + c);
    }
  }

  private clampCol(x: number): number {
    return Math.min(this.cols - 1, Math.max(0, Math.floor(x / this.cellSize)));
  }

  private clampRow(y: number): number {
    return Math.min(this.rows - 1, Math.max(0, Math.floor(y / this.cellSize)));
  }
}
