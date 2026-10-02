import { GAME } from '@/config/game';
import type { Vec2 } from '@/core/geometry';
import type { Hunter } from '@/sim/entities/hunter';
import { IDLE_INPUT, type PlayerInput } from '@/sim/playerInput';
import type { Simulation } from '@/sim/simulation';
import { playerMasked } from '@/sim/systems/emitters';
import { distanceField, findPath, smoothPath, UNREACHABLE } from '@/sim/world/pathfinding';
import { hasLineOfSight } from '@/sim/world/visibility';

/**
 * - basic: the Phase 9 bot. Knows the map, walks the shortest route to the
 *   nearest core, then the beacon, pings every 4 s, never sneaks or uses tools.
 * - careful: the same route, but plays like someone with headphones: sneaks
 *   when a hunter is close (or on metal with one in earshot) unless machine
 *   noise covers it, throws a stone
 *   to the side when one is coming, shocks it on contact, and pings less
 *   (never with a hunter nearby).
 */
export type BotProfile = 'basic' | 'careful';

export const BOT_PROFILES: readonly BotProfile[] = ['basic', 'careful'];

/** Tuning of the two profiles. Distances in px, times in s. */
const PROFILE = {
  basic: { pingEvery: 4, quietRange: 0, sneakRange: 0, stoneRange: 0, stoneEvery: 0 },
  careful: { pingEvery: 6, quietRange: 250, sneakRange: 180, stoneRange: 320, stoneEvery: 4 },
} as const;

/**
 * Hunters closer than this can be heard (their footsteps' audio range): the
 * careful bot reads their real positions only within it, like a player
 * with headphones.
 */
const HEARING = 460;
/** How far a decoy stone is thrown (px). */
const THROW = 250;
/** Replan the route this often, to recover from knockback (s). */
const REPLAN = 0.5;
/** A waypoint counts as reached within this distance (px). */
const ARRIVE = 3;

/** Decides a player's input every tick from the simulation's state. */
export class Bot {
  protected readonly sim: Simulation;
  private readonly tune: (typeof PROFILE)[BotProfile];
  private readonly careful: boolean;
  private route: Vec2[] = [];
  /** Where the bot is heading now (kept while still valid, so it doesn't dither). */
  protected target: Vec2 | null = null;
  private plannedAt = -Infinity;
  private lastPing = -Infinity;
  private lastStone = -Infinity;

  constructor(sim: Simulation, profile: BotProfile) {
    this.sim = sim;
    this.tune = PROFILE[profile];
    this.careful = profile === 'careful';
  }

  input(): PlayerInput {
    const { state } = this.sim;
    const { player } = state;
    const target = this.nextTarget();
    if (!target) return IDLE_INPUT;
    if (target !== this.target || state.time - this.plannedAt >= REPLAN) this.plan(target);

    while (this.route.length > 0 && dist(player, this.route[0]) <= ARRIVE) this.route.shift();
    const wp = this.route[0] ?? target;
    const d = dist(player, wp);
    const input: PlayerInput = {
      ...IDLE_INPUT,
      moveX: d > 0 ? (wp.x - player.x) / d : 0,
      moveY: d > 0 ? (wp.y - player.y) / d : 0,
    };

    const threat = this.careful ? this.nearestHeardHunter() : null;
    const threatDistance = threat ? dist(player, threat) : Infinity;

    const pingQuiet = threatDistance < this.tune.quietRange;
    if (
      !pingQuiet &&
      player.pingCooldown <= 0 &&
      state.time - this.lastPing >= this.tune.pingEvery
    ) {
      input.ping = true;
      this.lastPing = state.time;
    }

    if (threat) {
      // Close hunters: sneak. Any hunter in earshot: don't clang across metal grates.
      const onMetal = state.layout.tiles.surfaceAt(player.x, player.y) === 'metal';
      // In running cover, walking is silent anyway: go at full speed.
      input.sneak = (threatDistance < this.tune.sneakRange || onMetal) && !playerMasked(state);
      const reach = GAME.abilities.shockwave.effectRadius - threat.radius;
      if (
        threatDistance < reach &&
        player.shockCooldown <= 0 &&
        hasLineOfSight(state.walls, player.x, player.y, threat.x, threat.y)
      ) {
        input.shockwave = true;
      } else if (
        threat.state === 'investigate' &&
        threatDistance < this.tune.stoneRange &&
        player.stones > 0 &&
        state.time - this.lastStone >= this.tune.stoneEvery
      ) {
        input.throwStone = true;
        input.aim = this.decoyPoint(threat);
        this.lastStone = state.time;
      }
    }
    return input;
  }

  /** The nearest remaining core by walking distance, then the beacon once it is awake. */
  protected nextTarget(): Vec2 | null {
    const { cores, beacon } = this.sim.state;
    const remaining = cores.filter((c) => !c.collected);
    if (remaining.length === 0) return beacon.active ? beacon : null;
    return this.nearest(remaining);
  }

  /**
   * The point closest by walking distance. The current target wins while it
   * is still among them, so the bot doesn't switch back and forth.
   */
  protected nearest(points: readonly Vec2[]): Vec2 {
    if (points.length === 1) return points[0];
    if (this.target && points.includes(this.target)) return this.target;
    const { player, layout } = this.sim.state;
    const { tiles } = layout;
    const field = distanceField(tiles, [
      { tx: tiles.toTile(player.x), ty: tiles.toTile(player.y) },
    ]);
    let best = points[0];
    let bestSteps = Infinity;
    for (const p of points) {
      const steps = field[tiles.index(tiles.toTile(p.x), tiles.toTile(p.y))];
      if (steps !== UNREACHABLE && steps < bestSteps) {
        best = p;
        bestSteps = steps;
      }
    }
    return best;
  }

  private plan(target: Vec2): void {
    const { player, layout, time } = this.sim.state;
    const { tiles } = layout;
    this.target = target;
    this.plannedAt = time;
    const from = { tx: tiles.toTile(player.x), ty: tiles.toTile(player.y) };
    const to = { tx: tiles.toTile(target.x), ty: tiles.toTile(target.y) };
    const path = findPath(tiles, from, to);
    if (!path) {
      this.route = [];
      return;
    }
    const points = path.map((t) => tiles.center(t));
    points[points.length - 1] = { x: target.x, y: target.y };
    this.route = smoothPath(tiles, player, points, player.radius + 1);
  }

  private nearestHeardHunter(): Hunter | null {
    const { player, hunters } = this.sim.state;
    let best: Hunter | null = null;
    let bestDistance = HEARING;
    for (const h of hunters) {
      if (h.state === 'stunned') continue;
      const d = dist(player, h);
      if (d < bestDistance) {
        best = h;
        bestDistance = d;
      }
    }
    return best;
  }

  /** Throw sideways from the line to the hunter, so it walks off our way. */
  private decoyPoint(hunter: Hunter): Vec2 {
    const { player } = this.sim.state;
    const d = dist(player, hunter) || 1;
    const nx = (hunter.x - player.x) / d;
    const ny = (hunter.y - player.y) / d;
    // Of the two sides, the one pointing away from where we are going.
    const wp = this.route[0] ?? player;
    const side = (wp.x - player.x) * -ny + (wp.y - player.y) * nx > 0 ? -1 : 1;
    return { x: player.x - ny * side * THROW, y: player.y + nx * side * THROW };
  }
}

function dist(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
