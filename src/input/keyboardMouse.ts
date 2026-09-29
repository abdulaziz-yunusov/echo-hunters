export interface RawInputHandlers {
  /** An input id went down. Returns true when it is bound, so the browser default is suppressed. */
  down(inputId: string): boolean;
  up(inputId: string): void;
  /** Pointer moved, in CSS pixels relative to the canvas. */
  pointer(x: number, y: number): void;
  /** Focus lost: key-ups may be missed, so release everything. */
  lost(): void;
}

/**
 * Translates keyboard and mouse DOM events into input ids
 * (KeyboardEvent.code, or 'Mouse0'…'Mouse2'). Returns a detach function.
 */
export function attachKeyboardMouse(canvas: HTMLCanvasElement, h: RawInputHandlers): () => void {
  const onKeyDown = (e: KeyboardEvent): void => {
    // Leave browser shortcuts (Ctrl+R, Alt+Tab, …) alone.
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (h.down(e.code)) e.preventDefault();
  };
  const onKeyUp = (e: KeyboardEvent): void => h.up(e.code);

  const onMouseDown = (e: MouseEvent): void => {
    onMouseMove(e);
    if (h.down(`Mouse${e.button}`)) e.preventDefault();
  };
  // On window, so releasing the button outside the canvas still counts.
  const onMouseUp = (e: MouseEvent): void => h.up(`Mouse${e.button}`);
  const onMouseMove = (e: MouseEvent): void => {
    const rect = canvas.getBoundingClientRect();
    h.pointer(e.clientX - rect.left, e.clientY - rect.top);
  };
  const onContextMenu = (e: Event): void => e.preventDefault();
  const onBlur = (): void => h.lost();
  const onVisibility = (): void => {
    if (document.hidden) h.lost();
  };

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('mouseup', onMouseUp);
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('blur', onBlur);
  document.addEventListener('visibilitychange', onVisibility);
  canvas.addEventListener('mousedown', onMouseDown);
  canvas.addEventListener('contextmenu', onContextMenu);

  return () => {
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    window.removeEventListener('mouseup', onMouseUp);
    window.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('blur', onBlur);
    document.removeEventListener('visibilitychange', onVisibility);
    canvas.removeEventListener('mousedown', onMouseDown);
    canvas.removeEventListener('contextmenu', onContextMenu);
  };
}
