import { GAME } from '@/config/game';
import { HUNTER_COMMON } from '@/config/hunters';
import { PICKUP_TYPES } from '@/config/pickups';
import { setHunterState } from '../ai/hunterBrain';
import type { EntityId } from '../entities/entity';
import type { Core } from '../entities/objectives';
import type { Pickup } from '../entities/pickup';
import type { Player } from '../entities/player';
import type { GameState, SimContext, TakeKind } from '../gameState';
import { hasLineOfSight } from '../world/visibility';
import { soundMasked } from './emitters';

/*
 * Taking, hitting, dropping and winning. Solo play decides everything at
 * once. In a duel the host decides, and the client only asks (then applies
 * what the host says, see net/netSession.ts).
 */

/** The player with this id on this machine (local or rival), if any. */
export function playerById(state: GameState, id: EntityId): Player | null {
  if (state.player.id === id) return state.player;
  return state.rival?.id === id ? state.rival : null;
}

/** Cores needed to wake the beacon and to extract. */
export function coresNeeded(state: GameState): number {
  return state.duel?.coresToWin ?? state.cores.filter((c) => !c.dropped).length;
}

// ─── Taking contested things (cores, pickups) ──────────────────────────────

/** The local player touches something: take it now, or (duel client) ask the host. */
export function take(ctx: SimContext, kind: TakeKind, id: number): void {
  const { state } = ctx;
  if (state.mode !== 'client') {
    tryGrant(ctx, kind, id, state.player.id);
    return;
  }
  const key = `${kind}:${id}`;
  const duel = state.duel;
  if (!duel || duel.pending.includes(key)) return;
  const core = kind === 'core' ? state.cores.find((c) => c.id === id) : undefined;
  if (core && isLockedFor(state, core, state.player.id)) return; // no point asking yet
  duel.pending.push(key);
  ctx.events.emit('takeRequested', { kind, id });
}

/** Referee: give it to `by` if nobody has it yet. Returns whether it was given. */
export function tryGrant(ctx: SimContext, kind: TakeKind, id: number, by: EntityId): boolean {
  const item = find(ctx.state, kind, id);
  if (!item || item.collected) return false;
  if (kind === 'core' && isLockedFor(ctx.state, item as Core, by)) return false;
  grant(ctx, kind, id, by);
  return true;
}

/** Hand it over (on the host's word, in a duel client). Safe to repeat. */
export function grant(ctx: SimContext, kind: TakeKind, id: number, by: EntityId): void {
  const { state } = ctx;
  clearPending(state, kind, id);
  const item = find(state, kind, id);
  if (!item || item.collected) return;
  item.collected = true;
  const holder = playerById(state, by);

  if (kind === 'core') {
    if (holder) holder.cores++;
    ctx.events.emit('coreCollected', { coreId: id, by, x: item.x, y: item.y });
    // A core the other player dropped: a steal (Phase 28).
    const from = (item as Core).lockedFor;
    if (from !== undefined && from !== by) {
      ctx.events.emit('coreStolen', { by, from, x: item.x, y: item.y });
    }
  } else {
    const pickup = item as Pickup;
    if (holder === state.player) applyPickup(holder, pickup);
    ctx.events.emit('pickupCollected', {
      pickupId: id,
      type: pickup.type,
      x: item.x,
      y: item.y,
      by,
    });
  }
}

/** A just-dropped core can't be taken back at once by the player who dropped it. */
export function isLockedFor(state: GameState, core: Core, who: EntityId): boolean {
  return core.lockedFor === who && state.time < (core.lockedUntil ?? 0);
}

/** Duel client: the host said no (someone was faster). */
export function clearPending(state: GameState, kind: TakeKind, id: number): void {
  const duel = state.duel;
  if (duel) duel.pending = duel.pending.filter((k) => k !== `${kind}:${id}`);
}

/** Would this pickup do anything for the player right now? (A heart at full HP would not.) */
export function canUse(player: Player, p: Pickup): boolean {
  return p.type !== 'heart' || player.hp < player.maxHp;
}

function applyPickup(player: Player, p: Pickup): void {
  switch (p.type) {
    case 'stoneBag':
      player.stones += PICKUP_TYPES.stoneBag.stones;
      break;
    case 'heart':
      player.hp = Math.min(player.maxHp, player.hp + PICKUP_TYPES.heart.hp);
      break;
    case 'silentBoots':
      player.silentTime = PICKUP_TYPES.silentBoots.duration;
      break;
  }
}

function find(state: GameState, kind: TakeKind, id: number) {
  return kind === 'core'
    ? state.cores.find((c) => c.id === id)
    : state.pickups.find((p) => p.id === id);
}

// ─── Carried cores (Phase 28) ───────────────────────────────────────────────

/**
 * Duel: the cores a player carries hum every `carryHumInterval` s, louder
 * with enough of them to win. Sneaking and Silent Boots don't quiet it;
 * only machine noise (sound cover) does, and then nobody hears it, the
 * rival included. Each side hums its own player, like footsteps.
 */
export function updateCarryHum(ctx: SimContext, player: Player, dt: number): void {
  const { state } = ctx;
  if (!state.duel) return;
  if (player.cores === 0) {
    player.carryHumTimer = GAME.duel.carryHumInterval;
    return;
  }
  player.carryHumTimer -= dt;
  if (player.carryHumTimer > 1e-9) return;
  player.carryHumTimer += GAME.duel.carryHumInterval;
  const kind = player.cores >= coresNeeded(state) ? 'carriedHumHeavy' : 'carriedHum';
  if (!soundMasked(state, kind, player.x, player.y)) {
    ctx.emitSound(kind, player.x, player.y, player.id);
  }
}

// ─── Extraction and the end of a round ──────────────────────────────────────

/**
 * Where the local player stands with respect to extraction, every tick.
 * Solo: reaching the active beacon with every core ends the round at once.
 * Duel: standing there with enough cores starts an extraction that takes
 * `extractTime`; the host decides (its own player directly, the client
 * by asking), and leaving cancels it.
 */
export function updateExtraction(ctx: SimContext, player: Player): void {
  const { state } = ctx;
  const { beacon } = state;
  const reach = GAME.objectives.pickupRadius + player.radius;
  const there =
    beacon.active &&
    player.cores >= coresNeeded(state) &&
    Math.hypot(player.x - beacon.x, player.y - beacon.y) <= reach;
  const duel = state.duel;
  if (!duel) {
    if (there) endRound(ctx, 'extracted');
    return;
  }
  if (state.mode === 'client') {
    if (there !== duel.atBeacon) {
      duel.atBeacon = there;
      ctx.events.emit(there ? 'extractRequested' : 'extractLeft');
    }
    return;
  }
  if (there && !duel.extracting) startExtraction(ctx, player.id);
  else if (!there) cancelExtraction(ctx, player.id);
}

/** Referee: `by` is at the active beacon with enough cores; start the clock. */
export function startExtraction(ctx: SimContext, by: EntityId): boolean {
  const { state } = ctx;
  const duel = state.duel;
  const holder = playerById(state, by);
  if (!duel || duel.extracting || !holder || !canExtract(state, holder)) return false;
  duel.extracting = { by, since: state.time };
  ctx.events.emit('extractStarted', { by });
  return true;
}

/** Referee (and the client, told by the host): `by` is no longer extracting. */
export function cancelExtraction(ctx: SimContext, by: EntityId): void {
  const duel = ctx.state.duel;
  if (duel?.extracting?.by !== by) return;
  duel.extracting = null;
  ctx.events.emit('extractCancelled', { by });
}

/** Duel client: the host says `by` started extracting. */
export function extractionStarted(ctx: SimContext, by: EntityId): void {
  const duel = ctx.state.duel;
  if (!duel || duel.extracting?.by === by) return;
  duel.extracting = { by, since: ctx.state.time };
  ctx.events.emit('extractStarted', { by });
}

/** Duel client: the host cancelled `by`'s extraction. Ours? Ask again if we're still there. */
export function extractionCancelled(ctx: SimContext, by: EntityId): void {
  const duel = ctx.state.duel;
  if (!duel) return;
  if (by === ctx.state.player.id) duel.atBeacon = false;
  cancelExtraction(ctx, by);
}

/** Referee, every tick: an extraction that lasted `extractTime` wins; one that can't go on stops. */
export function updateExtractionClock(ctx: SimContext): void {
  const { state } = ctx;
  const ex = state.duel?.extracting;
  if (!ex || state.mode === 'client' || state.status !== 'playing') return;
  const holder = playerById(state, ex.by);
  if (!holder || !canExtract(state, holder)) cancelExtraction(ctx, ex.by);
  else if (state.time - ex.since >= GAME.duel.extractTime - 1e-9) declareWinner(ctx, ex.by);
}

/** How far along the current extraction is, 0..1 (null: nobody is extracting). */
export function extractionProgress(state: GameState): number | null {
  const ex = state.duel?.extracting;
  if (!ex) return null;
  return Math.min(1, (state.time - ex.since) / GAME.duel.extractTime);
}

function canExtract(state: GameState, holder: Player): boolean {
  return state.beacon.active && holder.cores >= coresNeeded(state);
}

export function declareWinner(ctx: SimContext, winner: EntityId): void {
  const { state } = ctx;
  if (!state.duel || state.duel.winner !== null) return;
  state.duel.winner = winner;
  ctx.events.emit('duelEnded', { winner });
  endRound(ctx, winner === state.player.id ? 'extracted' : 'lost');
}

function endRound(ctx: SimContext, status: 'extracted' | 'dead' | 'lost'): void {
  const { state } = ctx;
  if (state.status !== 'playing') return;
  state.status = status;
  ctx.events.emit('roundEnded', { status, time: state.time });
}

// ─── Hits ────────────────────────────────────────────────────────────────────

/**
 * `target` is hit from (fromX, fromY) by `by`. Solo: lose 1 HP (0 = dead).
 * Duel: no HP; every `hitsToDrop` hits, the carried cores fall to the floor.
 * Either way: knockback and a moment of safety.
 */
export function hitPlayer(
  ctx: SimContext,
  target: Player,
  fromX: number,
  fromY: number,
  by: EntityId,
): void {
  const { state } = ctx;
  if (target.invulnerable > 0) return;
  target.invulnerable = GAME.player.invulnerableTime;
  knockAway(target, fromX, fromY);

  let hits = 0;
  if (state.duel) {
    // Any hit starts an extraction over (Phase 28).
    cancelExtraction(ctx, target.id);
    hits = (state.duel.hits[target.id] ?? 0) + 1;
    state.duel.hits[target.id] = hits;
    if (hits >= state.duel.hitsToDrop) {
      dropCores(ctx, target);
      state.duel.hits[target.id] = 0;
    }
  } else {
    target.hp = Math.max(0, target.hp - HUNTER_COMMON.attackDamage);
  }
  ctx.events.emit('playerHit', {
    x: target.x,
    y: target.y,
    hp: target.hp,
    by,
    target: target.id,
    hits,
  });
  if (!state.duel && target.hp === 0) endRound(ctx, 'dead');
}

/** Duel client: the host says we were hit. Knockback and safety only; the host counts. */
export function receiveHit(ctx: SimContext, hits: number, fromX: number, fromY: number): void {
  const { state } = ctx;
  const p = state.player;
  p.invulnerable = GAME.player.invulnerableTime;
  knockAway(p, fromX, fromY);
  if (state.duel) state.duel.hits[p.id] = hits;
  ctx.events.emit('playerHit', { x: p.x, y: p.y, hp: p.hp, by: 0, target: p.id, hits });
}

function knockAway(p: Player, fromX: number, fromY: number): void {
  const dx = p.x - fromX;
  const dy = p.y - fromY;
  const d = Math.hypot(dx, dy);
  const speed = GAME.player.knockbackSpeed;
  p.knockVx = d > 0 ? (dx / d) * speed : speed;
  p.knockVy = d > 0 ? (dy / d) * speed : 0;
}

/**
 * Referee: the carried cores become new cores on the floor, where the
 * player stands (or, with `dropScatterTiles`, on open floor around it).
 */
export function dropCores(ctx: SimContext, target: Player): void {
  const { state } = ctx;
  if (target.cores === 0) return;
  const cores = [];
  let id = Math.max(0, ...state.cores.map((c) => c.id));
  for (let i = 0; i < target.cores; i++) {
    const at = scatter(state, target.x, target.y);
    const core = { id: ++id, x: at.x, y: at.y };
    state.cores.push({
      ...core,
      collected: false,
      humTimer: 1,
      dropped: true,
      lockedFor: target.id,
      lockedUntil: state.time + GAME.duel.dropLockSeconds,
    });
    cores.push(core);
  }
  target.cores = 0;
  ctx.events.emit('coresDropped', { by: target.id, cores });
}

/** A floor tile center within `dropScatterTiles` of (x, y), in sight, from the host's seeded stream. */
function scatter(state: GameState, x: number, y: number): { x: number; y: number } {
  const range = GAME.duel.dropScatterTiles;
  if (range <= 0) return { x, y };
  const { tiles } = state.layout;
  const tx = tiles.toTile(x);
  const ty = tiles.toTile(y);
  const spots: { x: number; y: number }[] = [];
  for (let dy = -range; dy <= range; dy++) {
    for (let dx = -range; dx <= range; dx++) {
      if (!tiles.isFloor(tx + dx, ty + dy)) continue;
      const c = tiles.center({ tx: tx + dx, ty: ty + dy });
      if (hasLineOfSight(state.walls, x, y, c.x, c.y)) spots.push(c);
    }
  }
  return spots.length > 0 ? state.rng.pick(spots) : { x, y };
}

// ─── Shockwave effects ───────────────────────────────────────────────────────

/**
 * What a shockwave at (x, y) by `by` does (GDD §5): stuns hunters in reach
 * and in sight, and in a duel also hits the other player. Stun points are
 * given once per hunter per level. Run by solo and the duel host only.
 */
export function resolveShockwave(ctx: SimContext, x: number, y: number, by: EntityId): void {
  const { state } = ctx;
  const reach = GAME.abilities.shockwave.effectRadius;
  for (const h of state.hunters) {
    if (Math.hypot(h.x - x, h.y - y) > reach + h.radius) continue;
    if (!hasLineOfSight(state.walls, x, y, h.x, h.y)) continue;
    setHunterState(ctx, h, 'stunned');
    const scored = by === state.player.id && !h.stunScored;
    if (scored) {
      h.stunScored = true;
      state.stats.huntersStunned++;
    }
    ctx.events.emit('hunterStunned', { hunterId: h.id, x: h.x, y: h.y, scored });
  }

  if (!state.duel || !state.rival) return;
  const other = by === state.player.id ? state.rival : state.player;
  if (Math.hypot(other.x - x, other.y - y) > reach + other.radius) return;
  if (!hasLineOfSight(state.walls, x, y, other.x, other.y)) return;
  hitPlayer(ctx, other, x, y, by);
}
