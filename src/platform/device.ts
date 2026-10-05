/**
 * Is this a touch-first device (a phone or tablet)? Used for hints only:
 * the on-screen controls appear when a finger is actually used (Phase 12).
 */
export function isTouchDevice(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
}
