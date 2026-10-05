import { CELLS, EDITOR, type CellCode } from '@/config/editor';
import type { CustomMap } from './customMap';

/** Markers there may be only one of: placing one elsewhere moves it. */
const UNIQUE: readonly CellCode[] = [CELLS.start, CELLS.beacon];
/** Terrain is painted by dragging; markers are placed one tap at a time. */
const TERRAIN: readonly CellCode[] = [CELLS.wall, CELLS.floor, CELLS.metal, CELLS.moss];

export function isTerrain(code: CellCode): boolean {
  return TERRAIN.includes(code);
}

/**
 * Editing a hand-made map (Phase 13): paint cells, keep the outer wall,
 * keep the start and beacon unique, and undo whole strokes.
 */
export class MapEditing {
  private current: CustomMap;
  private readonly undoStack: CellCode[][] = [];

  constructor(map: CustomMap) {
    this.current = { ...map, cells: [...map.cells] };
  }

  get map(): Readonly<CustomMap> {
    return this.current;
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  /** Start a new map (the old one can be undone back to only if the sizes match). */
  replace(map: CustomMap): void {
    if (map.width === this.current.width && map.height === this.current.height) this.beginStroke();
    else this.undoStack.length = 0;
    this.current = { ...map, cells: [...map.cells] };
  }

  /** A press begins one undo step, however many cells the drag then paints. */
  beginStroke(): void {
    this.undoStack.push([...this.current.cells]);
    if (this.undoStack.length > EDITOR.undoSteps) this.undoStack.shift();
  }

  undo(): void {
    const cells = this.undoStack.pop();
    if (cells) this.current = { ...this.current, cells };
  }

  /** Paint one cell. The outer edge stays wall; a unique marker moves here. Returns whether anything changed. */
  paint(tx: number, ty: number, code: CellCode): boolean {
    const { width, height, cells } = this.current;
    if (tx <= 0 || ty <= 0 || tx >= width - 1 || ty >= height - 1) return false;
    const i = ty * width + tx;
    if (cells[i] === code) return false;
    if (UNIQUE.includes(code)) {
      const old = cells.indexOf(code);
      if (old >= 0) cells[old] = CELLS.floor;
    }
    cells[i] = code;
    return true;
  }
}
