import { setHunterState } from '../ai/hunterBrain';
import type { SimContext } from '../gameState';
import { hitPlayer } from './duel';

/**
 * Touch damage (GDD §5 ATTACK): a hunter that touches a player hits them
 * (see duel.ts hitPlayer), then stops to recover, which gives the player a
 * chance to run. In a duel the host checks both players.
 */
export function updateCombat(ctx: SimContext, dt: number): void {
  const { state } = ctx;
  const targets = state.rival ? [state.player, state.rival] : [state.player];
  for (const p of targets) p.invulnerable = Math.max(0, p.invulnerable - dt);

  for (const h of state.hunters) {
    if (h.state === 'attack' || h.state === 'stunned') continue;
    for (const p of targets) {
      if (Math.hypot(p.x - h.x, p.y - h.y) > h.radius + p.radius) continue;
      setHunterState(ctx, h, 'attack');
      hitPlayer(ctx, p, h.x, h.y, h.id);
      if (state.status !== 'playing') return;
      break;
    }
  }
}
