import type { Vec2 } from '@/core/geometry';

export const FLOOR = 0;
export const WALL = 1;
export type TileType = typeof FLOOR | typeof WALL;

/** A tile position (column, row). Separate from world-pixel Vec2 on purpose. */
export interface TileCoord {
  tx: number;
  ty: number;
}

/** Orthogonal neighbour offsets: up, right, down, left. */
export const DIRS4: readonly (readonly [number, number])[] = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
];

/** Grid of floor and wall tiles. Anything outside the grid counts as wall. */
export class TileMap {
  readonly width: number;
  readonly height: number;
  /** World pixels per tile. */
  readonly tileSize: number;
  readonly tiles: Uint8Array;

  constructor(width: number, height: number, tileSize: number, fill: TileType = WALL) {
    this.width = width;
    this.height = height;
    this.tileSize = tileSize;
    this.tiles = new Uint8Array(width * height).fill(fill);
  }

  get worldWidth(): number {
    return this.width * this.tileSize;
  }

  get worldHeight(): number {
    return this.height * this.tileSize;
  }

  inBounds(tx: number, ty: number): boolean {
    return tx >= 0 && ty >= 0 && tx < this.width && ty < this.height;
  }

  index(tx: number, ty: number): number {
    return ty * this.width + tx;
  }

  coordOf(index: number): TileCoord {
    return { tx: index % this.width, ty: Math.floor(index / this.width) };
  }

  get(tx: number, ty: number): TileType {
    return this.inBounds(tx, ty) ? (this.tiles[this.index(tx, ty)] as TileType) : WALL;
  }

  isFloor(tx: number, ty: number): boolean {
    return this.get(tx, ty) === FLOOR;
  }

  isWall(tx: number, ty: number): boolean {
    return this.get(tx, ty) === WALL;
  }

  set(tx: number, ty: number, type: TileType): void {
    if (!this.inBounds(tx, ty)) throw new Error(`Tile out of bounds: ${tx},${ty}`);
    this.tiles[this.index(tx, ty)] = type;
  }

  /** Tile containing a world coordinate (one axis). */
  toTile(worldPx: number): number {
    return Math.floor(worldPx / this.tileSize);
  }

  /** World-pixel center of a tile. */
  center(t: TileCoord): Vec2 {
    return { x: (t.tx + 0.5) * this.tileSize, y: (t.ty + 0.5) * this.tileSize };
  }

  countFloor(): number {
    let n = 0;
    for (const t of this.tiles) if (t === FLOOR) n++;
    return n;
  }
}
