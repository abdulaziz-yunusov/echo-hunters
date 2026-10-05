export interface RawInputHandlers {
  /** An input id went down. Returns true when it is bound, so the browser default is suppressed. */
  down(inputId: string): boolean;
  up(inputId: string): void;
  /** Mouse moved, in CSS pixels relative to the canvas. */
  pointer(x: number, y: number): void;
  /** A finger (Phase 12) touched, moved or lifted, in CSS pixels relative to the canvas. */
  touchDown(finger: number, x: number, y: number): void;
  touchMove(finger: number, x: number, y: number): void;
  touchUp(finger: number): void;
  /** Focus lost: key-ups may be missed, so release everything. */
  lost(): void;
}

/**
 * Translates keyboard, mouse and touch DOM events into input ids
 * (KeyboardEvent.code, or 'Mouse0'…'Mouse2') and finger movements.
 * Pointer events cover the mouse and touch alike; cancelling a touch's
 * pointerdown also stops the browser from faking mouse events for it.
 * Returns a detach function.
 */
export function attachKeyboardMouse(canvas: HTMLCanvasElement, h: RawInputHandlers): () => void {
  const local = (e: PointerEvent) => {
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };
  const isTouch = (e: PointerEvent) => e.pointerType === 'touch' || e.pointerType === 'pen';

  const onKeyDown = (e: KeyboardEvent): void => {
    // Leave browser shortcuts (Ctrl+R, Alt+Tab, …) and typing in text fields alone.
    if (e.ctrlKey || e.metaKey || e.altKey || isTextField(e.target)) return;
    if (h.down(e.code)) e.preventDefault();
  };
  const onKeyUp = (e: KeyboardEvent): void => h.up(e.code);

  const onPointerDown = (e: PointerEvent): void => {
    const at = local(e);
    if (isTouch(e)) {
      e.preventDefault();
      h.touchDown(e.pointerId, at.x, at.y);
      return;
    }
    h.pointer(at.x, at.y);
    if (h.down(`Mouse${e.button}`)) e.preventDefault();
  };
  // On window, so moving or releasing outside the canvas still counts.
  const onPointerMove = (e: PointerEvent): void => {
    const at = local(e);
    if (isTouch(e)) h.touchMove(e.pointerId, at.x, at.y);
    else h.pointer(at.x, at.y);
  };
  const onPointerUp = (e: PointerEvent): void => {
    if (isTouch(e)) h.touchUp(e.pointerId);
    else h.up(`Mouse${e.button}`);
  };
  const onContextMenu = (e: Event): void => e.preventDefault();
  // iOS pinch-zoom and double-tap zoom ignore user-scalable=no without this.
  const onGesture = (e: Event): void => e.preventDefault();
  const onBlur = (): void => h.lost();
  const onVisibility = (): void => {
    if (document.hidden) h.lost();
  };

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('pointercancel', onPointerUp);
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('blur', onBlur);
  document.addEventListener('visibilitychange', onVisibility);
  document.addEventListener('gesturestart', onGesture);
  document.addEventListener('dblclick', onGesture);
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('contextmenu', onContextMenu);

  return () => {
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    window.removeEventListener('pointerup', onPointerUp);
    window.removeEventListener('pointercancel', onPointerUp);
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('blur', onBlur);
    document.removeEventListener('visibilitychange', onVisibility);
    document.removeEventListener('gesturestart', onGesture);
    document.removeEventListener('dblclick', onGesture);
    canvas.removeEventListener('pointerdown', onPointerDown);
    canvas.removeEventListener('contextmenu', onContextMenu);
  };
}

function isTextField(target: EventTarget | null): boolean {
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;
}
