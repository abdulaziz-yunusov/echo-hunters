import { GAME } from '@/config/game';
import type { SimContext } from '../gameState';

/**
 * Close calls (Phase 15): a hunter comes within `closeCall.radius` of the
 * player and the player is not hit for `closeCall.window` seconds, whether
 * the hunter walks away or keeps searching nearby. Each approach counts
 * once; the hunter must go beyond `exitRadius` to arm the next one. A hit
 * spoils the approach. Stunned hunters are harmless, so walking past one
 * is not a close call. Solo only: points are per player.
 */
export function updateCloseCalls(ctx: SimContext): void {
  const { state } = ctx;
  if (state.status !== 'playing') return;
  const { player } = state;
  const { radius, exitRadius, window } = GAME.closeCall;

  for (const h of state.hunters) {
    const d = Math.hypot(h.x - player.x, h.y - player.y);
    if (d > exitRadius) {
      h.closeCallSince = null;
      h.closeCallDone = false;
      continue;
    }
    if (h.closeCallDone) continue;
    if (h.state === 'stunned') {
      h.closeCallSince = null;
      continue;
    }
    // Recently hit (by this hunter or another): no close call this approach.
    if (player.invulnerable > 0) {
      h.closeCallDone = h.closeCallSince !== null;
      h.closeCallSince = null;
      continue;
    }
    if (h.closeCallSince === null) {
      if (d <= radius) h.closeCallSince = state.time;
      continue;
    }
    if (state.time - h.closeCallSince < window) continue;

    h.closeCallDone = true;
    const scored = state.stats.closeCalls < GAME.scoring.closeCallMax;
    if (scored) state.stats.closeCalls++;
    ctx.events.emit('closeCall', { hunterId: h.id, x: h.x, y: h.y, scored });
  }
}
