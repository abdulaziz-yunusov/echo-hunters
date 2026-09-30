import { PALETTES, THEME, type PaletteId } from '@/config/theme';

/** Switch every renderer to a palette. Colors are read when drawn, so it applies at once. */
export function applyPalette(id: PaletteId): void {
  Object.assign(THEME.colors, PALETTES[id]);
}
