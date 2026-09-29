import { GAME } from '@/config/game';
import type { Player } from '../entities/player';
import type { SimContext } from '../gameState';
import type { PlayerInput } from '../playerInput';
import { resolveShockwave } from './duel';

/** The player's three tools (GDD §3): sonar ping, decoy stone, shockwave. */
export function updateAbilities(
  ctx: SimContext,
  player: Player,
  input: PlayerInput,
  dt: number,
): void {
  player.pingCooldown = Math.max(0, player.pingCooldown - dt);
  player.shockCooldown = Math.max(0, player.shockCooldown - dt);

  if (input.ping && player.pingCooldown === 0) {
    ctx.emitSound('ping', player.x, player.y, player.id);
    player.pingCooldown = ctx.state.rules.pingCooldown;
    player.pingsUsed++;
  }
  if (input.throwStone && player.stones > 0) throwStone(ctx, player, input);
  if (input.shockwave && player.shockCooldown === 0) shockwave(ctx, player);
}

/**
 * Throw toward the aim point (capped at throwRange), or straight ahead
 * without a pointer (touch). Silent in flight; see systems/stones.ts.
 */
function throwStone(ctx: SimContext, player: Player, input: PlayerInput): void {
  const { throwRange, flightTime } = GAME.abilities.stone;
  let dx = player.facingX;
  let dy = player.facingY;
  let distance = throwRange;
  if (input.aim) {
    const ax = input.aim.x - player.x;
    const ay = input.aim.y - player.y;
    const length = Math.hypot(ax, ay);
    if (length >= 1) {
      dx = ax / length;
      dy = ay / length;
      distance = Math.min(length, throwRange);
    }
  }
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
