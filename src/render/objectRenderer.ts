import type { PickupTypeId } from '@/config/pickups';
import { THEME, type ColorKey } from '@/config/theme';
import type { Beacon, Core } from '@/sim/entities/objectives';
import type { Pickup } from '@/sim/entities/pickup';
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
  extraction: number | null = null,
): void {
  if (extraction !== null) drawExtraction(ctx, beacon, extraction, pixel);
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

/**
 * Duel (Phase 28): a ring around the beacon fills as an extraction goes on.
 * Shown even in the dark: the faster pulses already tell everyone.
 */
function drawExtraction(
  ctx: CanvasRenderingContext2D,
  beacon: Beacon,
  progress: number,
  pixel: number,
): void {
  const r = BEACON_RADIUS * 1.9;
  ctx.save();
  ctx.strokeStyle = THEME.colors.green;
  ctx.shadowColor = THEME.colors.green;
  ctx.shadowBlur = THEME.glowBlur;
  ctx.lineWidth = 3 * pixel;
  ctx.globalAlpha = 0.25;
  ctx.beginPath();
  ctx.arc(beacon.x, beacon.y, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.beginPath();
  ctx.arc(beacon.x, beacon.y, r, -Math.PI / 2, -Math.PI / 2 + progress * Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

export const pickupKey = (p: Pickup): string => `pickup:${p.id}`;

/** Pickups (GDD §5): small icons, seen only when sound touches them. */
export function drawPickups(
  ctx: CanvasRenderingContext2D,
  pickups: readonly Pickup[],
  reveal: RevealMap,
  now: number,
  fadeSeconds: number,
  ghostAlpha: number,
  pixel: number,
): void {
  drawPickupIcons(ctx, pickups, pixel, (p) =>
    revealAlpha(reveal.objectRevealTime(pickupKey(p)), now, fadeSeconds, ghostAlpha),
  );
}

/** Draw pickup icons at the brightness `alphaOf` gives each (debug: always 1). */
export function drawPickupIcons(
  ctx: CanvasRenderingContext2D,
  pickups: readonly Pickup[],
  pixel: number,
  alphaOf: (p: Pickup) => number,
): void {
  ctx.save();
  ctx.shadowBlur = THEME.glowBlur;
  ctx.lineWidth = 2 * pixel;
  for (const p of pickups) {
    if (p.collected) continue;
    const a = alphaOf(p);
    if (a <= 0) continue;
    ctx.globalAlpha = a;
    const color = THEME.colors[PICKUP_COLORS[p.type]];
    ctx.fillStyle = color;
    ctx.strokeStyle = color;
    ctx.shadowColor = color;
    ctx.beginPath();
    PICKUP_SHAPES[p.type](ctx, p.x, p.y);
    if (OUTLINED.includes(p.type)) ctx.stroke();
    else ctx.fill();
  }
  ctx.restore();
}

const PICKUP_COLORS: Record<PickupTypeId, ColorKey> = {
  stoneBag: 'white',
  heart: 'red',
  silentBoots: 'cyan',
  trapKit: 'red',
  flare: 'orange',
  decoySteps: 'white',
};

/** Drawn as outlines; the rest are filled. */
const OUTLINED: readonly PickupTypeId[] = ['silentBoots', 'trapKit', 'decoySteps'];

type Shape = (ctx: CanvasRenderingContext2D, x: number, y: number) => void;

const PICKUP_SHAPES: Record<PickupTypeId, Shape> = {
  // A little pile of stones.
  stoneBag: (ctx, x, y) => {
    for (const [dx, dy] of [
      [-3.5, 2],
      [3.5, 2],
      [0, -3],
    ]) {
      ctx.moveTo(x + dx + 2.6, y + dy);
      ctx.arc(x + dx, y + dy, 2.6, 0, Math.PI * 2);
    }
  },
  heart: (ctx, x, y) => {
    ctx.moveTo(x, y + 6);
    ctx.bezierCurveTo(x - 9, y, x - 5, y - 8, x, y - 3);
    ctx.bezierCurveTo(x + 5, y - 8, x + 9, y, x, y + 6);
  },
  // Two chevrons: quick and quiet.
  silentBoots: (ctx, x, y) => {
    for (const dx of [-3, 3]) {
      ctx.moveTo(x + dx - 3, y - 5);
      ctx.lineTo(x + dx + 2, y);
      ctx.lineTo(x + dx - 3, y + 5);
    }
  },
  // Duel tools (Phase 29). A trap: open jaws.
  trapKit: (ctx, x, y) => {
    ctx.moveTo(x - 7, y - 2);
    for (let i = 0; i < 4; i++) ctx.lineTo(x - 5 + i * 4, i % 2 ? y - 2 : y + 3);
    ctx.lineTo(x + 7, y - 2);
    ctx.moveTo(x - 7, y + 5);
    ctx.lineTo(x + 7, y + 5);
  },
  // A flare: a four-pointed spark.
  flare: (ctx, x, y) => {
    for (let i = 0; i < 8; i++) {
      const r = i % 2 === 0 ? 7 : 2.5;
      const a = (i * Math.PI) / 4 - Math.PI / 2;
      if (i === 0) ctx.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
      else ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
    }
    ctx.closePath();
  },
  // Decoy steps: two footprints, walking.
  decoySteps: (ctx, x, y) => {
    for (const [dx, dy] of [
      [-3, 3],
      [3, -3],
    ]) {
      ctx.moveTo(x + dx + 2, y + dy);
      ctx.ellipse(x + dx, y + dy, 2, 3.5, 0, 0, Math.PI * 2);
    }
  },
};
