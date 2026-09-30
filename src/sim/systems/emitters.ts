import { EMITTER_TYPES } from '@/config/emitters';
import type { SoundTag } from '@/config/sounds';
import type { GameState, SimContext } from '../gameState';

/** Run each vent and pipe's cycle: at the start of each active spell, it makes its noise. */
export function updateEmitters(ctx: SimContext, dt: number): void {
  for (const e of ctx.state.emitters) {
    const def = EMITTER_TYPES[e.type];
    e.activeLeft = Math.max(0, e.activeLeft - dt);
    e.timer -= dt;
    if (e.timer <= 0) {
      e.timer += def.period;
      e.activeLeft = def.activeTime;
      ctx.emitSound(def.sound, e.x, e.y, null);
    }
  }
}

/** Sound tags that noise can hide. Pings, stones and shockwaves always cut through. */
const MASKABLE: readonly SoundTag[] = ['footstep'];

/**
 * Is a sound with these tags, starting at (x, y), lost in machine noise?
 * True for a footstep or wall bump within an active emitter's `maskRadius`.
 */
export function isMasked(
  state: Pick<GameState, 'emitters'>,
  x: number,
  y: number,
  tags: readonly SoundTag[],
): boolean {
  if (!tags.some((t) => MASKABLE.includes(t))) return false;
  // A wall bump is also an 'impact': louder than footsteps, but still a scuff in the noise.
  return state.emitters.some(
    (e) => e.activeLeft > 0 && Math.hypot(x - e.x, y - e.y) <= EMITTER_TYPES[e.type].maskRadius,
  );
}

/** Is the player standing in active cover right now (HUD)? */
export function playerMasked(state: GameState): boolean {
  const { player } = state;
  return isMasked(state, player.x, player.y, MASKABLE);
}
