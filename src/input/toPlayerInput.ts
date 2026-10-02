import { IDLE_INPUT, type PlayerInput } from '@/sim/playerInput';
import type { InputFrame } from './inputFrame';

/**
 * The gameplay part of a tick's input, in world terms (the aim point goes
 * through the camera). `idle` gives a player who does nothing, e.g. while a
 * duel menu is open over a game that keeps running.
 */
export function toPlayerInput(
  input: InputFrame,
  screenToWorld: (x: number, y: number) => { x: number; y: number },
  idle = false,
): PlayerInput {
  if (idle) return { ...IDLE_INPUT };
  return {
    moveX: input.moveX,
    moveY: input.moveY,
    sneak: input.sneak,
    ping: input.ping,
    pingHeld: input.pingHeld,
    throwStone: input.throwStone,
    shockwave: input.shockwave,
    aim: input.aim ? screenToWorld(input.aim.x, input.aim.y) : null,
  };
}
