import { GAME } from '@/config/game';
import type { ToolId } from '@/config/pickups';
import type { EntityId } from './entity';

/** The Echo. Plain data: systems update it, renderers read it. */
export interface Player {
  readonly id: EntityId;
  /** Position (world px) now and at the previous tick, for smooth drawing. */
  x: number;
  y: number;
  prevX: number;
  prevY: number;
  /** Actual velocity after collisions (px/s). */
  vx: number;
  vy: number;
  readonly radius: number;
  sneaking: boolean;
  /** Walking distance since the last footstep (px). */
  stride: number;
  /** Pressed against a wall during the last tick. */
  touchingWall: boolean;
  /** Seconds until another wall bump can make a sound. */
  bumpCooldown: number;
  /** Seconds until the sonar ping is ready. */
  pingCooldown: number;
  /** Seconds the ping key has been held, while it is down; null when it is up. */
  pingHold: number | null;
  /** Seconds until the charged beam is ready (Phase 18). */
  beamCooldown: number;
  /** Pings this round, beams included (the ghost bonus needs zero). */
  pingsUsed: number;
  hp: number;
  readonly maxHp: number;
  /** Decoy stones carried (thrown in Phase 7). */
  stones: number;
  /** Signal Cores carried. */
  cores: number;
  /** Seconds of protection left after being hit. */
  invulnerable: number;
  /** Knockback velocity (px/s), fading out. */
  knockVx: number;
  knockVy: number;
  /** Last direction moved (unit vector): where a stone goes without a mouse. */
  facingX: number;
  facingY: number;
  /** Seconds until the shockwave is ready. */
  shockCooldown: number;
  /** Seconds of Silent Boots left. */
  silentTime: number;
  /** Duel: seconds until the cores this player carries hum again (Phase 28). */
  carryHumTimer: number;
  /** Duel: the tool in the one tool slot (Phase 29). */
  tool: ToolId | null;
  /** Duel: Decoy Steps walking away from where they were set off; null when none. */
  decoy: Decoy | null;
}

/** Fake footsteps on the move (Phase 29). */
export interface Decoy {
  x: number;
  y: number;
  /** Where it walks, along the corridors, toward the aim (next waypoint first). */
  route: { x: number; y: number }[];
  /** Seconds left. */
  left: number;
  /** Distance walked since its last step (px). */
  stride: number;
}

export function createPlayer(id: EntityId, x: number, y: number): Player {
  return {
    id,
    x,
    y,
    prevX: x,
    prevY: y,
    vx: 0,
    vy: 0,
    radius: GAME.player.radius,
    sneaking: false,
    stride: 0,
    touchingWall: false,
    bumpCooldown: 0,
    pingCooldown: 0,
    pingHold: null,
    beamCooldown: 0,
    pingsUsed: 0,
    hp: GAME.player.hp,
    maxHp: GAME.player.hp,
    stones: GAME.player.startStones,
    cores: 0,
    invulnerable: 0,
    knockVx: 0,
    knockVy: 0,
    facingX: 1,
    facingY: 0,
    shockCooldown: 0,
    silentTime: 0,
    carryHumTimer: GAME.duel.carryHumInterval,
    tool: null,
    decoy: null,
  };
}

/** A beam needs its own cooldown and the ping's to be over. */
export function beamReady(p: Player): boolean {
  return p.beamCooldown === 0 && p.pingCooldown === 0;
}

/**
 * Held past the charge time with the beam ready: releasing now fires a beam.
 * The player moves at sneak speed meanwhile.
 */
export function beamCharged(p: Player): boolean {
  return p.pingHold !== null && p.pingHold >= GAME.abilities.beam.chargeTime && beamReady(p);
}
