import { HUNTER_TYPES } from '@/config/hunters';
import { enterState, updateState } from '@/core/fsm';
import type { Hunter, HunterStateId } from '../entities/hunter';
import type { SimContext } from '../gameState';
import { BEHAVIOURS } from './behaviours';
import type { HunterContext } from './hunterContext';

function contextFor(sim: SimContext, hunter: Hunter): HunterContext {
  return { sim, hunter, def: HUNTER_TYPES[hunter.type] };
}

/** Think and move for every hunter. Sounds heard last tick are handled, then forgotten. */
export function updateHunters(sim: SimContext, dt: number): void {
  for (const hunter of sim.state.hunters) {
    const c = contextFor(sim, hunter);
    hunter.cooldown = Math.max(0, hunter.cooldown - dt);
    updateState(BEHAVIOURS[c.def.behaviour], hunter, c, dt);
    hunter.heard = null;
  }
}

/** Force a hunter into a state from outside its brain (combat: attack, stunned). */
export function setHunterState(sim: SimContext, hunter: Hunter, to: HunterStateId): void {
  const c = contextFor(sim, hunter);
  enterState(BEHAVIOURS[c.def.behaviour], hunter, c, to);
}
