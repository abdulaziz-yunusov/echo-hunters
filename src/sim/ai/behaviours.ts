import { HUNTER_COMMON, type HunterBehaviourId } from '@/config/hunters';
import type { State, StateTable } from '@/core/fsm';
import type { Vec2 } from '@/core/geometry';
import type { HunterStateId } from '../entities/hunter';
import type { GameState } from '../gameState';
import { moveCircle } from '../world/collision';
import { hasLineOfSight } from '../world/visibility';
import type { HunterContext } from './hunterContext';
import { followPath, randomPointNear, setGoal, stop } from './navigation';
import { isPlayerId, nextTrailPoint, trailPointAt } from './trail';

type HunterState = State<HunterContext, HunterStateId>;
type HunterTable = StateTable<HunterContext, HunterStateId>;

// ─── Shared by every hunter type ─────────────────────────────────────────

/** Just hit the player: stand still for a moment, then search around. */
const attack: HunterState = {
  enter: ({ hunter }) => stop(hunter),
  update: (_c, _dt, time) => (time >= HUNTER_COMMON.attackRecover ? 'search' : undefined),
};

/** Hit by a shockwave: frozen and deaf, then back to idle. */
const stunned: HunterState = {
  enter: ({ hunter }) => stop(hunter),
  update: (_c, _dt, time) => (time >= HUNTER_COMMON.stunTime ? 'idle' : undefined),
};

// ─── Stalker (and Sprinter: same behaviour, different numbers) ──────────

/** Stroll nearby at a slow pace, pausing now and then, until something is heard. */
const wander: HunterState = {
  enter: (c) => {
    stop(c.hunter);
    c.hunter.pause = pauseLength(c);
  },
  update: (c, dt) => {
    const h = c.hunter;
    if (h.heard) return 'investigate';
    if (h.pause > 0) {
      h.pause -= dt;
      return;
    }
    if (!h.goal) {
      const range = HUNTER_COMMON.wanderRangeTiles * c.sim.state.layout.tiles.tileSize;
      const spot = randomPointNear(c, h, range);
      if (!spot || !setGoal(c, spot)) {
        h.pause = pauseLength(c);
        return;
      }
    }
    if (followPath(c, c.def.speed * HUNTER_COMMON.wanderSpeedFactor, dt) !== 'moving') {
      h.pause = pauseLength(c);
    }
  },
};

/** Go straight to where the sound came from. A newer sound changes the target. */
const investigate: HunterState = {
  enter: (c) => headForHeardSound(c),
  update: (c, dt) => {
    if (c.hunter.heard) headForHeardSound(c);
    return followPath(c, c.def.speed, dt) === 'moving' ? undefined : 'search';
  },
};

/** Poke around the spot for a while (GDD: random points within 100 px for 4 s). */
const search: HunterState = {
  enter: (c) => {
    stop(c.hunter);
    c.hunter.searchCenter = { x: c.hunter.x, y: c.hunter.y };
  },
  update: (c, dt, time) => {
    const h = c.hunter;
    if (h.heard) return 'investigate';
    if (time >= c.def.searchTime) return 'idle';
    if (!h.goal) {
      const spot = randomPointNear(c, h.searchCenter ?? h, c.def.searchRadius);
      if (!spot || !setGoal(c, spot)) return;
    }
    followPath(c, c.def.speed * HUNTER_COMMON.searchSpeedFactor, dt);
  },
};

// ─── Listener: stands still, turns slowly, screams at what it hears ─────

/** Seconds the Listener holds still after screaming. */
const SCREAM_HOLD = 0.8;

const listen: HunterState = {
  enter: ({ hunter }) => stop(hunter),
  update: (c, dt) => {
    const h = c.hunter;
    h.facing += (((c.def.turnSpeed ?? 0) * Math.PI) / 180) * dt;
    if (h.heard && h.cooldown === 0) return 'investigate';
  },
};

/**
 * Scream (GDD §5): a huge ring from the Listener that sends every other
 * hunter to the noise it heard, not to the Listener itself.
 */
const scream: HunterState = {
  enter: (c) => {
    const h = c.hunter;
    if (h.heard) {
      c.sim.emitSound('listenerScream', h.x, h.y, h.id, { focus: h.heard });
      h.cooldown = c.def.screamCooldown ?? 0;
    }
    h.heard = null;
  },
  update: (_c, _dt, time) => (time >= SCREAM_HOLD ? 'idle' : undefined),
};

const backToIdle: HunterState = { update: () => 'idle' };

// ─── Tracker: follows your footsteps, not your noise (Phase 19a) ────────

/**
 * Go to the step it heard, then from step to step along that player's
 * trail, in order, sniffing as it goes. It ignores new sounds meanwhile.
 * Where the trail ends or breaks (a gap: the player went quiet), it searches.
 */
const followTrail: HunterState = {
  enter: (c) => {
    const h = c.hunter;
    h.trailAt = h.heard ? trailPointAt(c.sim.state, h.heard.x, h.heard.y) : null;
    h.cooldown = 0;
    headForHeardSound(c);
  },
  update: (c, dt) => {
    const h = c.hunter;
    if (h.cooldown === 0) {
      c.sim.emitSound('trackerSniff', h.x, h.y, h.id);
      h.cooldown = c.def.sniffInterval ?? 1;
    }
    const travel = followPath(c, c.def.speed, dt);
    if (travel === 'moving') return;
    const next =
      travel === 'arrived' && h.trailAt
        ? nextTrailPoint(c.sim.state, h.trailAt, c.def.trailGap ?? 0)
        : null;
    if (!next || !setGoal(c, next)) return 'search';
    h.trailAt = next;
  },
  exit: ({ hunter }) => {
    hunter.trailAt = null;
  },
};

// ─── Echo: moves only while a sound you made is still spreading (19b) ───

/** Frozen. It still listens, and remembers where the last sound came from. */
const frozen: HunterState = {
  update: (c, dt) => {
    const h = c.hunter;
    if (h.heard) aimAtHeardSound(c);
    h.quietTime += dt;
    if (h.goal && playerSoundSpreading(c.sim.state)) return 'investigate';
  },
};

/** Rush at the last sound heard, for as long as a player's ring is still growing. */
const rush: HunterState = {
  enter: (c) => {
    const h = c.hunter;
    if (h.quietTime >= (c.def.wakeQuiet ?? 0)) c.sim.emitSound('echoRewind', h.x, h.y, h.id);
  },
  update: (c, dt) => {
    const h = c.hunter;
    if (h.heard) aimAtHeardSound(c);
    if (!playerSoundSpreading(c.sim.state)) return 'idle';
    h.quietTime = 0;
    return followPath(c, c.def.speed, dt) === 'moving' ? undefined : 'idle';
  },
};

// ─── Mimic: a lure that pretends to be a core (19c) ─────────────────────

/** A Mimic this close to its spot is home (px). */
const HOME_REACH = 4;

/**
 * At home it hums like a core. It answers a ping with a fake one,
 * `echoDelay` s later, from where it stands. Away from home (after a
 * lunge), it walks back. A player close by and in sight: lunge.
 */
const lurk: HunterState = {
  enter: ({ hunter }) => stop(hunter),
  update: (c, dt) => {
    const h = c.hunter;
    const { state } = c.sim;
    if (h.heard) h.answerAt ??= state.time + (c.def.echoDelay ?? 0);
    if (h.answerAt !== null && state.time >= h.answerAt) {
      c.sim.emitSound('mimicPing', h.x, h.y, h.id);
      h.answerAt = null;
    }
    if (Math.hypot(h.x - h.home.x, h.y - h.home.y) > HOME_REACH) {
      if (h.goal || setGoal(c, h.home)) followPath(c, c.def.speed, dt);
    } else {
      h.humTimer -= dt;
      if (h.humTimer <= 0) {
        c.sim.emitSound('mimicHum', h.x, h.y, h.id);
        h.humTimer += state.rules.coreHumInterval;
      }
    }
    if (h.cooldown === 0 && lungeTarget(c)) return 'investigate';
  },
};

/** A short, straight dash at the player it saw, then back home. */
const lunge: HunterState = {
  enter: (c) => {
    const h = c.hunter;
    stop(h);
    const target = lungeTarget(c);
    if (target) h.facing = Math.atan2(target.y - h.y, target.x - h.x);
  },
  update: (c, dt, time) => {
    const h = c.hunter;
    if (time >= (c.def.lungeTime ?? 0)) return 'search';
    const step = (c.def.lungeSpeed ?? 0) * dt;
    const tiles = c.sim.state.layout.tiles;
    const moved = moveCircle(
      tiles,
      h.x,
      h.y,
      h.radius,
      Math.cos(h.facing) * step,
      Math.sin(h.facing) * step,
    );
    h.x = moved.x;
    h.y = moved.y;
  },
  exit: (c) => {
    c.hunter.cooldown = c.def.lungeCooldown ?? 0;
  },
};

export const BEHAVIOURS: Readonly<Record<HunterBehaviourId, HunterTable>> = {
  stalker: { idle: wander, investigate, search, attack, stunned },
  // "investigate" is the Listener's scream; it never walks anywhere.
  listener: { idle: listen, investigate: scream, search: backToIdle, attack, stunned },
  // "investigate" is following a trail.
  tracker: { idle: wander, investigate: followTrail, search, attack, stunned },
  // "idle" is frozen, "investigate" is rushing; it never searches.
  echo: { idle: frozen, investigate: rush, search: backToIdle, attack, stunned },
  // "idle" is waiting at (or going back to) its spot, "investigate" is the lunge.
  mimic: { idle: lurk, investigate: lunge, search: backToIdle, attack, stunned },
};

function headForHeardSound(c: HunterContext): void {
  const h = c.hunter;
  if (h.heard) setGoal(c, h.heard);
  h.heard = null;
}

/** Echo: plan a route to the sound just heard, without moving yet. */
function aimAtHeardSound(c: HunterContext): void {
  const h = c.hunter;
  if (h.heard) setGoal(c, h.heard);
  h.heard = null;
}

/** Is a sound a player made still spreading (a ring still growing)? */
export function playerSoundSpreading(state: GameState): boolean {
  return state.waves.some((w) => isPlayerId(w.owner) && w.radius < w.maxRadius);
}

/** Mimic: the nearest player within lunge range and in line of sight, if any. */
function lungeTarget(c: HunterContext): Vec2 | null {
  const h = c.hunter;
  const { state } = c.sim;
  const range = c.def.lungeRange ?? 0;
  let best: Vec2 | null = null;
  let bestDistance = range;
  for (const p of state.rival ? [state.player, state.rival] : [state.player]) {
    const d = Math.hypot(p.x - h.x, p.y - h.y);
    if (d > bestDistance || !hasLineOfSight(state.walls, h.x, h.y, p.x, p.y)) continue;
    best = p;
    bestDistance = d;
  }
  return best;
}

function pauseLength(c: HunterContext): number {
  const { min, max } = HUNTER_COMMON.idlePause;
  return c.sim.state.rng.range(min, max);
}
