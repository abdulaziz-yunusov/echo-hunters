import { GAME } from '@/config/game';
import type { Vec2 } from '@/core/geometry';
import type { PlayerInput } from '@/sim/playerInput';

/**
 * One tick's input after another to fire a charged beam (Phase 18): press
 * the ping key, hold it past the charge time while aiming, let go.
 */
export function chargedBeam(aim: Vec2 | null, dt = 1 / 60): Partial<PlayerInput>[] {
  const holdTicks = Math.ceil(GAME.abilities.beam.chargeTime / dt) + 1;
  const held: Partial<PlayerInput> = { pingHeld: true, aim };
  return [{ ...held, ping: true }, ...Array<Partial<PlayerInput>>(holdTicks).fill(held), { aim }];
}
