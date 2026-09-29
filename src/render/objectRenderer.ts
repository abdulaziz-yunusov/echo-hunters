import { THEME } from '@/config/theme';
import type { Beacon, Core } from '@/sim/entities/objectives';
import type { RevealMap } from './revealMap';

export const coreKey = (core: Core): string => `core:${core.id}`;
export const BEACON_KEY = 'beacon';

/** Size of drawn objects (world px). */
const CORE_SIZE = 7;
const BEACON_RADIUS = 11;

/** How bright a revealed thing is now: 1 when touched, fading to the ghost level. */
export function revealAlpha(
  revealedAt: number,
  now: number,
  fadeSeconds: number,
  ghostAlpha: number,
): number {
  if (revealedAt === -Infinity) return 0;
  return Math.max(ghostAlpha, 1 - (now - revealedAt) / fadeSeconds);
}

/** Signal Cores: glowing diamonds, seen only when sound touches them. */
export function drawCores(
  ctx: CanvasRenderingContext2D,
  cores: readonly Core[],
  reveal: RevealMap,
  now: number,
  fadeSeconds: number,
  ghostAlpha: number,
): void {
  ctx.save();
  ctx.fillStyle = THEME.colors.cyan;
  ctx.shadowColor = THEME.colors.cyan;
  ctx.shadowBlur = THEME.glowBlur;
  for (const core of cores) {
    if (core.collected) continue;
    const a = revealAlpha(reveal.objectRevealTime(coreKey(core)), now, fadeSeconds, ghostAlpha);
    if (a <= 0) continue;
    ctx.globalAlpha = a;
    ctx.beginPath();
    ctx.moveTo(core.x, core.y - CORE_SIZE);
    ctx.lineTo(core.x + CORE_SIZE, core.y);
    ctx.lineTo(core.x, core.y + CORE_SIZE);
    ctx.lineTo(core.x - CORE_SIZE, core.y);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

/** The Extraction Beacon: a dim ring while asleep, a bright beacon once active. */
export function drawBeacon(
  ctx: CanvasRenderingContext2D,
  beacon: Beacon,
  reveal: RevealMap,
  now: number,
  fadeSeconds: number,
  ghostAlpha: number,
  pixel: number,
): void {
  const a = revealAlpha(reveal.objectRevealTime(BEACON_KEY), now, fadeSeconds, ghostAlpha);
  if (a <= 0) return;
  ctx.save();
  ctx.globalAlpha = a;
  ctx.strokeStyle = THEME.colors.green;
  ctx.fillStyle = THEME.colors.green;
  ctx.shadowColor = THEME.colors.green;
  ctx.shadowBlur = THEME.glowBlur;
  ctx.lineWidth = 2 * pixel;
  ctx.beginPath();
  ctx.arc(beacon.x, beacon.y, BEACON_RADIUS, 0, Math.PI * 2);
  ctx.stroke();
  if (beacon.active) {
    ctx.beginPath();
    ctx.arc(beacon.x, beacon.y, BEACON_RADIUS * 0.45, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}
