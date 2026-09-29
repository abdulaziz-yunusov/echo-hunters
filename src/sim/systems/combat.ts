import { GAME } from '@/config/game';
import { HUNTER_COMMON } from '@/config/hunters';
import { setHunterState } from '../ai/hunterBrain';
import type { SimContext } from '../gameState';

/**
 * Touch damage (GDD §5 ATTACK): a hunter that touches the player hits for
 * 1 HP, knocks them back, and the player is safe for a moment. The hunter
 * then stops to recover, which gives the player a chance to run.
 */
export function updateCombat(ctx: SimContext, dt: number): void {
  const { state } = ctx;
  const p = state.player;
  p.invulnerable = Math.max(0, p.invulnerable - dt);

  for (const h of state.hunters) {
    if (h.state === 'attack' || h.state === 'stunned') continue;
    const dx = p.x - h.x;
    const dy = p.y - h.y;
    const distance = Math.hypot(dx, dy);
    if (distance > h.radius + p.radius) continue;

    setHunterState(ctx, h, 'attack');
    if (p.invulnerable > 0) continue;

    p.hp = Math.max(0, p.hp - HUNTER_COMMON.attackDamage);
    p.invulnerable = GAME.player.invulnerableTime;
    const nx = distance > 0 ? dx / distance : 1;
    const ny = distance > 0 ? dy / distance : 0;
    p.knockVx = nx * GAME.player.knockbackSpeed;
    p.knockVy = ny * GAME.player.knockbackSpeed;
    ctx.events.emit('playerHit', { x: p.x, y: p.y, hp: p.hp, by: h.id });

    if (p.hp === 0) {
      state.status = 'dead';
      ctx.events.emit('roundEnded', { status: 'dead', time: state.time });
      return;
    }
  }
}
