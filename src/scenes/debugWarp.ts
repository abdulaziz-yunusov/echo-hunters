import type { GameState } from '@/sim/gameState';
import { coresNeeded, isLockedFor } from '@/sim/systems/duel';

/**
 * Debug only (T): jump to the nearest core this player may take, else to the
 * beacon (in a duel also once it carries enough). The game's own rules then
 * collect or extract. Edits the sim state from outside, so never use it
 * outside debug: it would break replays.
 */
export function warpToObjective(state: GameState): void {
  const { player, beacon } = state;
  const free =
    player.cores >= coresNeeded(state)
      ? []
      : state.cores.filter((c) => !c.collected && !isLockedFor(state, c, player.id));
  const distance = (p: { x: number; y: number }) => Math.hypot(p.x - player.x, p.y - player.y);
  const target = free.sort((a, b) => distance(a) - distance(b))[0] ?? beacon;
  player.x = player.prevX = target.x;
  player.y = player.prevY = target.y;
}
