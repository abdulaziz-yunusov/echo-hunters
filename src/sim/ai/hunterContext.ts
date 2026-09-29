import type { HunterTypeDef } from '@/config/hunters';
import type { Hunter } from '../entities/hunter';
import type { SimContext } from '../gameState';

/** What a hunter's states work with: the world, the hunter itself and its type. */
export interface HunterContext {
  sim: SimContext;
  hunter: Hunter;
  def: HunterTypeDef;
}
