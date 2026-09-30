import { GAME } from '@/config/game';
import { REPLAY } from '@/config/replay';
import { THEME, type ColorKey } from '@/config/theme';
import type { Vec2 } from '@/core/geometry';
import {
  HUNTER_STATE_CODES,
  PLAYER_SNEAKING,
  presentAt,
  samplePointAt,
  soundsAt,
  trackPosition,
  type Replay,
  type ReplayMarkKind,
  type ReplayTrack,
  type SamplePoint,
} from '@/replay/replay';
import type { SoundKindId } from '@/config/sounds';
import { drawHunterShape } from './hunterRenderer';
import { drawAllWalls } from './mapDebug';
import { drawPickupIcons } from './objectRenderer';
import { drawWaves } from './waveLayer';

/** Colors of timeline marks (and of the matching symbols on the map). */
export const MARK_COLORS: Record<ReplayMarkKind, ColorKey> = {
  core: 'cyan',
  pickup: 'white',
  beacon: 'green',
  hit: 'red',
  stun: 'orange',
  end: 'white',
};

/** Hunter trail color by AI state: chasing a sound is red, strolling is faint. */
const HUNTER_STATE_COLORS: Record<(typeof HUNTER_STATE_CODES)[number], ColorKey> = {
  idle: 'orange',
  investigate: 'red',
  search: 'orange',
  attack: 'red',
  stunned: 'white',
};

/** Noises the player made that get a lasting marker where they happened. */
const NOISE_MARKERS: Partial<Record<SoundKindId, ColorKey>> = {
  ping: 'cyan',
  stoneImpact: 'cyan',
  shockwave: 'red',
  wallBump: 'white',
};

/**
 * One moment of a replay over the whole, fully lit map: the player's path so
 * far, where they made noise, hunters with their recent trails, and the
 * rings that were spreading. ctx must already be in world pixels.
 */
export function drawReplayWorld(
  ctx: CanvasRenderingContext2D,
  replay: Replay,
  t: number,
  pixel: number,
): void {
  const at = samplePointAt(replay, t);
  drawAllWalls(ctx, replay.walls, pixel);
  drawObjects(ctx, replay, t, pixel);
  drawPlayerPath(ctx, replay, t, at, pixel);
  drawNoiseMarkers(ctx, replay, t, pixel);
  drawHits(ctx, replay, t, pixel);
  for (const h of replay.hunters) {
    drawTrail(ctx, replay, h.track, t, at, pixel);
    const pos = trackPosition(h.track, at);
    drawHunterShape(ctx, pos.x, pos.y, h.type, 0.8);
  }
  drawWaves(ctx, soundsAt(replay, t), 0, pixel);
  drawPlayerDot(ctx, trackPosition(replay.player, at));
}

function drawObjects(ctx: CanvasRenderingContext2D, replay: Replay, t: number, pixel: number) {
  ctx.save();
  ctx.lineWidth = 1.5 * pixel;
  ctx.shadowBlur = THEME.glowBlur;
  for (const c of replay.cores) {
    const here = presentAt(c, t);
    ctx.globalAlpha = here ? 1 : 0.3;
    ctx.fillStyle = ctx.strokeStyle = ctx.shadowColor = THEME.colors.cyan;
    diamond(ctx, c.x, c.y, 8);
    if (here) ctx.fill();
    else ctx.stroke();
  }
  const b = replay.beacon;
  const active = b.activeAt !== null && b.activeAt <= t;
  ctx.globalAlpha = active ? 0.7 + 0.3 * Math.sin(t * 6) : 0.35;
  ctx.fillStyle = ctx.shadowColor = THEME.colors.green;
  ctx.beginPath();
  ctx.arc(b.x, b.y, 11, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  const pickups = replay.pickups.map((p) => ({ ...p, collected: !presentAt(p, t) }));
  drawPickupIcons(ctx, pickups, pixel, () => 0.9);
}

/** The whole path so far (sneaking dimmer), with the last few seconds brighter. */
function drawPlayerPath(
  ctx: CanvasRenderingContext2D,
  replay: Replay,
  t: number,
  at: SamplePoint,
  pixel: number,
) {
  const { xy, codes } = replay.player;
  const now = trackPosition(replay.player, at);
  const recentFrom = t - REPLAY.playerTrail;
  const styleOf = (i: number) =>
    ((codes[i] & PLAYER_SNEAKING) !== 0 ? 1 : 0) + (replay.times[i] >= recentFrom ? 2 : 0);

  ctx.save();
  ctx.lineWidth = 2 * pixel;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  // Segment i runs from sample i to sample i + 1 (the last one to "now").
  // Runs of segments with the same look go into one stroke.
  let i = 0;
  while (i <= at.i) {
    const style = styleOf(i);
    const sneaking = (style & 1) !== 0;
    ctx.strokeStyle = sneaking ? THEME.colors.cyan : THEME.colors.white;
    ctx.globalAlpha = (sneaking ? 0.3 : 0.45) * (style & 2 ? 2 : 1);
    ctx.beginPath();
    ctx.moveTo(xy[i * 2], xy[i * 2 + 1]);
    for (; i <= at.i && styleOf(i) === style; i++) {
      const to = i < at.i ? { x: xy[i * 2 + 2], y: xy[i * 2 + 3] } : now;
      const jump = Math.hypot(to.x - xy[i * 2], to.y - xy[i * 2 + 1]);
      if (jump > REPLAY.teleportDistance) ctx.moveTo(to.x, to.y);
      else ctx.lineTo(to.x, to.y);
    }
    ctx.stroke();
  }
  ctx.restore();
}

/** A small ring where each loud noise of the player's started. */
function drawNoiseMarkers(ctx: CanvasRenderingContext2D, replay: Replay, t: number, pixel: number) {
  ctx.save();
  ctx.lineWidth = 1.5 * pixel;
  for (const s of replay.sounds) {
    if (s.startTime > t) break;
    const color = NOISE_MARKERS[s.kind];
    if (!color || s.owner !== replay.playerId) continue;
    ctx.globalAlpha = 0.7;
    ctx.strokeStyle = THEME.colors[color];
    ctx.beginPath();
    ctx.arc(s.x, s.y, 5, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

/** A red cross wherever the player was hit. */
function drawHits(ctx: CanvasRenderingContext2D, replay: Replay, t: number, pixel: number) {
  ctx.save();
  ctx.lineWidth = 2.5 * pixel;
  ctx.strokeStyle = THEME.colors.red;
  ctx.shadowColor = THEME.colors.red;
  ctx.shadowBlur = THEME.glowBlur;
  for (const m of replay.marks) {
    if (m.time > t) break;
    if (m.kind !== 'hit') continue;
    const s = 7;
    ctx.beginPath();
    ctx.moveTo(m.x - s, m.y - s);
    ctx.lineTo(m.x + s, m.y + s);
    ctx.moveTo(m.x + s, m.y - s);
    ctx.lineTo(m.x - s, m.y + s);
    ctx.stroke();
  }
  ctx.restore();
}

/** Where a hunter walked in the last few seconds, colored by what it was doing. */
function drawTrail(
  ctx: CanvasRenderingContext2D,
  replay: Replay,
  track: ReplayTrack,
  t: number,
  at: SamplePoint,
  pixel: number,
) {
  const from = t - REPLAY.hunterTrail;
  ctx.save();
  ctx.lineWidth = 2 * pixel;
  ctx.lineCap = 'round';
  const now = trackPosition(track, at);
  for (let i = at.i; i >= 0 && replay.times[i] >= from; i--) {
    const end: Vec2 = i === at.i ? now : { x: track.xy[i * 2 + 2], y: track.xy[i * 2 + 3] };
    const state = HUNTER_STATE_CODES[track.codes[i]] ?? 'idle';
    ctx.globalAlpha = 0.6 * (1 - (t - replay.times[i]) / REPLAY.hunterTrail);
    ctx.strokeStyle = THEME.colors[HUNTER_STATE_COLORS[state]];
    ctx.beginPath();
    ctx.moveTo(track.xy[i * 2], track.xy[i * 2 + 1]);
    ctx.lineTo(end.x, end.y);
    ctx.stroke();
  }
  ctx.restore();
}

function drawPlayerDot(ctx: CanvasRenderingContext2D, p: Vec2) {
  const aura = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, THEME.player.auraRadius);
  aura.addColorStop(0, 'rgba(255, 255, 255, 0.35)');
  aura.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = aura;
  ctx.beginPath();
  ctx.arc(p.x, p.y, THEME.player.auraRadius, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = THEME.player.color;
  ctx.beginPath();
  ctx.arc(p.x, p.y, GAME.player.radius, 0, Math.PI * 2);
  ctx.fill();
}

function diamond(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x, y - r);
  ctx.lineTo(x + r, y);
  ctx.lineTo(x, y + r);
  ctx.lineTo(x - r, y);
  ctx.closePath();
}
