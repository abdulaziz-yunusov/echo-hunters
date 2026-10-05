import { GAME } from '@/config/game';
import { TOOLS, type ToolId } from '@/config/pickups';
import { SURFACES } from '@/config/surfaces';
import type { EntityId } from '../entities/entity';
import type { Player } from '../entities/player';
import type { GameState, SimContext } from '../gameState';
import type { PlayerInput } from '../playerInput';
import { moveCircle } from '../world/collision';
import { findPath, smoothPath } from '../world/pathfinding';

/*
 * Duel tools (Phase 29). One slot; the tool is used up when used.
 *
 * - Trap Kit: placed where you stand. Only you (and the host, the referee)
 *   know it is there. The host fires it when the rival comes near.
 * - Flare: you see the rival's outline through walls for a moment; they
 *   are told (net: \`flare\`).
 * - Decoy Steps: fake footsteps walk off toward your aim while your own
 *   steps go quiet. They are the owner's sounds, so hunters and the rival
 *   take them for real ones.
 */

/** Every tick, for this machine's player: use the tool on request, walk the decoy; host: traps. */
export function updateTools(ctx: SimContext, player: Player, input: PlayerInput, dt: number): void {
  const { state } = ctx;
  if (!state.duel) return;
  if (input.useTool && player.tool) useTool(ctx, player, player.tool, input);
  updateDecoy(ctx, player, dt);
  if (state.mode === 'host') updateTraps(ctx);
}

function useTool(ctx: SimContext, player: Player, tool: ToolId, input: PlayerInput): void {
  const { state } = ctx;
  player.tool = null;
  let trapId: number | undefined;
  switch (tool) {
    case 'trapKit':
      trapId = state.nextTrapId++;
      placeTrap(state, player.id, trapId, player.x, player.y);
      break;
    case 'flare':
      state.duel!.revealRivalUntil = state.time + TOOLS.flare.revealSeconds;
      break;
    case 'decoySteps':
      startDecoy(ctx, player, input);
      break;
  }
  ctx.events.emit('toolUsed', { by: player.id, tool, x: player.x, y: player.y, trapId });
}

// ─── Trap Kit ───────────────────────────────────────────────────────────────

/** A trap on the floor; a player's oldest goes once they have too many. */
export function placeTrap(state: GameState, owner: EntityId, id: number, x: number, y: number) {
  state.traps.push({ id, owner, x, y });
  const mine = state.traps.filter((t) => t.owner === owner);
  if (mine.length > TOOLS.trapKit.maxPerPlayer) {
    state.traps = state.traps.filter((t) => t !== mine[0]);
  }
}

/**
 * Host: a trap fires when the other player comes within its trigger
 * radius (the rival by the position the network gives). It snaps, loud,
 * and shows its owner where the victim is. Each trap fires once.
 */
function updateTraps(ctx: SimContext): void {
  const { state } = ctx;
  const players = [state.player, state.rival].filter((p) => p !== null);
  for (const trap of [...state.traps]) {
    const victim = players.find(
      (p) =>
        p.id !== trap.owner &&
        Math.hypot(p.x - trap.x, p.y - trap.y) <= TOOLS.trapKit.triggerRadius,
    );
    if (victim) springTrap(ctx, { ...trap, victim: victim.id });
  }
}

/**
 * A trap snaps shut at (x, y): the host decided it, or (client) the host
 * said so. The client holds only its own traps, so it learns of the host's
 * when one fires on it. The owner sees the victim's outline for a moment.
 */
export function springTrap(
  ctx: SimContext,
  fired: { owner: EntityId; id: number; victim: EntityId; x: number; y: number },
): void {
  const { state } = ctx;
  const { owner, id, victim, x, y } = fired;
  const before = state.traps.length;
  state.traps = state.traps.filter((t) => !(t.owner === owner && t.id === id));
  if (state.mode === 'host' && state.traps.length === before) return; // already fired
  ctx.emitSound('trapSnap', x, y, null);
  if (owner === state.player.id && state.duel) {
    state.duel.revealRivalUntil = state.time + TOOLS.trapKit.revealSeconds;
  }
  ctx.events.emit('trapFired', { owner, victim, id, x, y });
}

// ─── Flare ──────────────────────────────────────────────────────────────────

/** The rival fired a flare: they see us for a moment, and we know it. */
export function flareSeen(ctx: SimContext): void {
  const duel = ctx.state.duel;
  if (!duel) return;
  duel.seenUntil = ctx.state.time + TOOLS.flare.revealSeconds;
  ctx.events.emit('flareSeen');
}

/** Does this machine's player see the rival's outline through walls right now? */
export function rivalRevealed(state: GameState): boolean {
  return state.duel !== null && state.time < state.duel.revealRivalUntil;
}

// ─── Decoy Steps ────────────────────────────────────────────────────────────

/**
 * The decoy heads for the point it could reach in its time, toward the aim,
 * and walks there along the corridors like a person would (straight on if
 * there is no way). Fake steps that walk into a wall would fool nobody.
 */
function startDecoy(ctx: SimContext, player: Player, input: PlayerInput): void {
  let dx = player.facingX;
  let dy = player.facingY;
  if (input.aim) {
    const ax = input.aim.x - player.x;
    const ay = input.aim.y - player.y;
    const d = Math.hypot(ax, ay);
    if (d > 1) {
      dx = ax / d;
      dy = ay / d;
    }
  }
  const { tiles } = ctx.state.layout;
  const reach = GAME.player.speed * TOOLS.decoySteps.seconds;
  const from = { tx: tiles.toTile(player.x), ty: tiles.toTile(player.y) };
  // The farthest open tile along the aim, within the decoy's reach.
  let to = from;
  for (let d = reach; d > 0; d -= tiles.tileSize / 2) {
    const t = { tx: tiles.toTile(player.x + dx * d), ty: tiles.toTile(player.y + dy * d) };
    if (tiles.isFloor(t.tx, t.ty)) {
      to = t;
      break;
    }
  }
  const path = findPath(tiles, from, to);
  const route = path
    ? smoothPath(
        tiles,
        player,
        path.map((t) => tiles.center(t)),
        player.radius + 1,
      )
    : [{ x: player.x + dx * reach, y: player.y + dy * reach }];
  player.decoy = {
    x: player.x,
    y: player.y,
    route,
    left: TOOLS.decoySteps.seconds,
    stride: 0,
  };
}

/**
 * The decoy walks at walking pace, sliding along walls like a player, and
 * steps like one: a footstep (for the floor under it) every stride.
 */
function updateDecoy(ctx: SimContext, player: Player, dt: number): void {
  const decoy = player.decoy;
  if (!decoy) return;
  decoy.left -= dt;
  if (decoy.left <= 0) {
    player.decoy = null;
    return;
  }
  const { tiles } = ctx.state.layout;
  const speed = GAME.player.speed;
  while (
    decoy.route.length > 0 &&
    Math.hypot(decoy.route[0].x - decoy.x, decoy.route[0].y - decoy.y) < 1
  ) {
    decoy.route.shift();
  }
  const next = decoy.route[0];
  if (!next) {
    player.decoy = null; // arrived: the steps stop
    return;
  }
  const gap = Math.hypot(next.x - decoy.x, next.y - decoy.y);
  const step = Math.min(gap, speed * dt);
  const moved = moveCircle(
    tiles,
    decoy.x,
    decoy.y,
    player.radius,
    ((next.x - decoy.x) / gap) * step,
    ((next.y - decoy.y) / gap) * step,
  );
  decoy.stride += Math.hypot(moved.x - decoy.x, moved.y - decoy.y);
  decoy.x = moved.x;
  decoy.y = moved.y;
  const strideLength = speed * GAME.player.footstepInterval;
  while (decoy.stride >= strideLength) {
    decoy.stride -= strideLength;
    const surface = tiles.surfaceAt(decoy.x, decoy.y);
    ctx.emitSound(SURFACES[surface].playerStep, decoy.x, decoy.y, player.id, { decoy: true });
  }
}

// ─── Swapped-out tools ──────────────────────────────────────────────────────

/**
 * A tool you dropped is yours to take again only once you have stepped away
 * from it. Each side keeps this for its own player (it owns its position);
 * the host trusts the request, as for extraction.
 */
export function unlockToolsFarFrom(state: GameState, player: Player | null): void {
  if (!player) return;
  const reach = GAME.objectives.pickupRadius + player.radius;
  for (const p of state.pickups) {
    if (p.lockedFor === player.id && Math.hypot(player.x - p.x, player.y - p.y) > reach) {
      p.lockedFor = undefined;
    }
  }
}
