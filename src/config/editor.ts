import type { ColorKey } from './theme';

/**
 * Map editor (Phase 13). Every tile is one URL-safe letter, so a whole map
 * fits in a link (`#map=…`). Markers (start, cores, hunters, pickups,
 * emitters) stand on ordinary floor.
 */
export const CELLS = {
  wall: 'w',
  floor: 'f',
  metal: 'm',
  moss: 'o',
  start: 'P',
  core: 'C',
  beacon: 'B',
  stalker: 'S',
  sprinter: 'R',
  listener: 'L',
  stoneBag: 'T',
  heart: 'H',
  silentBoots: 'O',
  vent: 'V',
  drip: 'D',
} as const;

export type CellId = keyof typeof CELLS;
export type CellCode = (typeof CELLS)[CellId];

/** The editor's palette, in order: label, and the color it is drawn in. */
export const EDITOR_TOOLS: readonly { cell: CellId; label: string; color: ColorKey }[] = [
  { cell: 'wall', label: 'WALL', color: 'white' },
  { cell: 'floor', label: 'FLOOR', color: 'dim' },
  { cell: 'metal', label: 'METAL', color: 'white' },
  { cell: 'moss', label: 'MOSS', color: 'green' },
  { cell: 'start', label: 'START', color: 'white' },
  { cell: 'core', label: 'CORE', color: 'cyan' },
  { cell: 'beacon', label: 'BEACON', color: 'green' },
  { cell: 'stalker', label: 'STALKER', color: 'red' },
  { cell: 'sprinter', label: 'SPRINTER', color: 'red' },
  { cell: 'listener', label: 'LISTENER', color: 'red' },
  { cell: 'stoneBag', label: 'STONES', color: 'white' },
  { cell: 'heart', label: 'HEART', color: 'red' },
  { cell: 'silentBoots', label: 'BOOTS', color: 'cyan' },
  { cell: 'vent', label: 'VENT', color: 'dim' },
  { cell: 'drip', label: 'PIPE', color: 'dim' },
];

export const EDITOR = {
  /** Map sizes offered for a new map (tiles). Medium is a normal level's size. */
  sizes: [
    { label: 'SMALL', width: 25, height: 15 },
    { label: 'MEDIUM', width: 41, height: 25 },
    { label: 'LARGE', width: 57, height: 35 },
  ],
  defaultSize: 1,
  /** Limits on a map read from a link (anything bigger is refused). */
  maxSide: 81,
  maxCores: 8,
  maxHunters: 8,
  /** Undo steps kept. */
  undoSteps: 50,
  /** A shared map in the URL: `#map=v1.41x25.…` */
  hashKey: 'map',
} as const;
