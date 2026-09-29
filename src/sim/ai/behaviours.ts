import { HUNTER_COMMON, type HunterBehaviourId } from '@/config/hunters';
import type { State, StateTable } from '@/core/fsm';
import type { HunterStateId } from '../entities/hunter';
import type { HunterContext } from './hunterContext';
import { followPath, randomPointNear, setGoal, stop } from './navigation';

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

// ─── Listener (Phase 9 adds the scream; for now it only stands and turns) ──

const standAndTurn: HunterState = {
  enter: ({ hunter }) => stop(hunter),
  update: (c, dt) => {
    c.hunter.facing += (((c.def.turnSpeed ?? 0) * Math.PI) / 180) * dt;
    return c.hunter.state === 'idle' ? undefined : 'idle';
  },
};

export const BEHAVIOURS: Readonly<Record<HunterBehaviourId, HunterTable>> = {
  stalker: { idle: wander, investigate, search, attack, stunned },
  listener: {
    idle: standAndTurn,
    investigate: standAndTurn,
    search: standAndTurn,
    attack,
    stunned,
  },
};

function headForHeardSound(c: HunterContext): void {
  const h = c.hunter;
  if (h.heard) setGoal(c, h.heard);
  h.heard = null;
}

function pauseLength(c: HunterContext): number {
  const { min, max } = HUNTER_COMMON.idlePause;
  return c.sim.state.rng.range(min, max);
}
