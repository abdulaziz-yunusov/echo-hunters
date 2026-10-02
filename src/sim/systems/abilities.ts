import { GAME } from '@/config/game';
import { beamCharged, type Player } from '../entities/player';
import type { SimContext } from '../gameState';
import type { PlayerInput } from '../playerInput';
import { resolveShockwave } from './duel';

/** The player's tools (GDD §3): sonar ping or charged beam, decoy stone, shockwave. */
export function updateAbilities(
  ctx: SimContext,
  player: Player,
  input: PlayerInput,
  dt: number,
): void {
  player.pingCooldown = Math.max(0, player.pingCooldown - dt);
  player.beamCooldown = Math.max(0, player.beamCooldown - dt);
  player.shockCooldown = Math.max(0, player.shockCooldown - dt);

  updatePingKey(ctx, player, input, dt);
  if (input.throwStone && player.stones > 0) throwStone(ctx, player, input);
  if (input.shockwave && player.shockCooldown === 0) shockwave(ctx, player);
}

/**
 * The ping key fires on release (Phase 18). A tap (released before
 * `beam.chargeTime`) pings all around. A charged hold fires a beam toward
 * the aim. A long hold that never charged (beam not ready) does nothing.
 */
function updatePingKey(ctx: SimContext, player: Player, input: PlayerInput, dt: number): void {
  if (input.ping) player.pingHold = 0;
  else if (player.pingHold !== null) player.pingHold += dt;
  if (player.pingHold === null || input.pingHeld) return;

  const tap = player.pingHold < GAME.abilities.beam.chargeTime;
  const charged = beamCharged(player);
  player.pingHold = null;
  if (charged) {
    const { dx, dy } = aimDirection(player, input);
    ctx.emitSound('pingBeam', player.x, player.y, player.id, { dir: Math.atan2(dy, dx) });
    player.beamCooldown = GAME.abilities.beam.cooldown;
  } else if (tap && player.pingCooldown === 0) {
    ctx.emitSound('ping', player.x, player.y, player.id);
  } else {
    return;
  }
  player.pingCooldown = ctx.state.rules.pingCooldown;
  player.pingsUsed++;
}

/**
 * Throw toward the aim point (capped at throwRange), or straight ahead
 * without a pointer (touch). Silent in flight; see systems/stones.ts.
 */
function throwStone(ctx: SimContext, player: Player, input: PlayerInput): void {
  const { throwRange, flightTime } = GAME.abilities.stone;
  const { dx, dy, length } = aimDirection(player, input);
  const distance = Math.min(length, throwRange);
  const speed = throwRange / flightTime;
  const s = ctx.state;
  s.stones.push({
    id: s.nextStoneId++,
    owner: player.id,
    x: player.x,
    y: player.y,
    prevX: player.x,
    prevY: player.y,
    vx: dx * speed,
    vy: dy * speed,
    timeLeft: distance / speed,
  });
  player.stones--;
  ctx.events.emit('stoneThrown', {
    x: player.x,
    y: player.y,
    toX: player.x + dx * distance,
    toY: player.y + dy * distance,
  });
}

/**
 * Unit direction toward the aim point and how far it is. Without a pointer
 * (touch), or with it on top of the player, the facing direction and no limit.
 */
function aimDirection(
  player: Player,
  input: PlayerInput,
): { dx: number; dy: number; length: number } {
  if (input.aim) {
    const ax = input.aim.x - player.x;
    const ay = input.aim.y - player.y;
    const length = Math.hypot(ax, ay);
    if (length >= 1) return { dx: ax / length, dy: ay / length, length };
  }
  return { dx: player.facingX, dy: player.facingY, length: Infinity };
}

/**
 * Stun every hunter within reach and in line of sight. Loud: the red ring
 * gives the player away to every other hunter in earshot. Stun points are
 * given once per hunter per level, so stunning the same one again and
 * again earns nothing.
 */
function shockwave(ctx: SimContext, player: Player): void {
  ctx.emitSound('shockwave', player.x, player.y, player.id);
  player.shockCooldown = GAME.abilities.shockwave.cooldown;
  // A duel client only makes the sound; the host resolves what it hits.
  if (ctx.state.mode !== 'client') resolveShockwave(ctx, player.x, player.y, player.id);
}
