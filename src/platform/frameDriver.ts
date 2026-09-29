import type { FixedLoop } from '@/core/loop';

/**
 * Drives a FixedLoop from requestAnimationFrame. Stops while the tab is
 * hidden and resets the loop on return, so no time jump is simulated.
 * Returns a stop function.
 */
export function startFrameDriver(loop: FixedLoop): () => void {
  let handle = 0;
  let running = false;

  const onFrame = (timeMs: number): void => {
    loop.frame(timeMs / 1000);
    handle = requestAnimationFrame(onFrame);
  };

  const start = (): void => {
    if (running) return;
    running = true;
    loop.reset();
    handle = requestAnimationFrame(onFrame);
  };

  const stop = (): void => {
    running = false;
    cancelAnimationFrame(handle);
  };

  const onVisibility = (): void => (document.hidden ? stop() : start());

  document.addEventListener('visibilitychange', onVisibility);
  if (!document.hidden) start();

  return () => {
    stop();
    document.removeEventListener('visibilitychange', onVisibility);
  };
}
