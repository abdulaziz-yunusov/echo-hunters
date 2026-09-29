import { GAME } from '@/config/game';
import type { Player } from '../entities/player';
import type { SimContext } from '../gameState';
import { coresNeeded, extract, take } from './duel';

/**
 * The round's goal (GDD §2, §8): collect Signal Cores, which wakes the
 * Extraction Beacon, then reach it. Solo needs every core; a duel needs
 * `coresToWin` of them, carried by one player.
 */
export function updateObjectives(ctx: SimContext, player: Player, dt: number): void {
  const { state } = ctx;
  const cfg = GAME.objectives;
  const reach = cfg.pickupRadius + player.radius;

  for (const core of state.cores) {
    if (core.collected) continue;
    if (Math.hypot(player.x - core.x, player.y - core.y) <= reach) {
      take(ctx, 'core', core.id);
      if (core.collected) continue;
    }
    core.humTimer -= dt;
    if (core.humTimer <= 0) {
      ctx.emitSound('coreHum', core.x, core.y, null);
      core.humTimer += cfg.coreHumInterval;
    }
  }

  // Awake while someone carries enough cores (a drop in a duel puts it back to sleep).
  const beacon = state.beacon;
  const need = coresNeeded(state);
  const carried = Math.max(player.cores, state.rival?.cores ?? 0);
  const awake = carried >= need;
  if (awake && !beacon.active) {
    beacon.active = true;
    beacon.pulseTimer = 0; // first pulse right away
    ctx.events.emit('beaconActivated', { x: beacon.x, y: beacon.y });
  } else if (!awake) {
    beacon.active = false;
  }
  if (!beacon.active) return;

  beacon.pulseTimer -= dt;
  if (beacon.pulseTimer <= 0) {
    ctx.emitSound('beacon', beacon.x, beacon.y, null);
    beacon.pulseTimer += cfg.beaconPulseInterval;
  }
  if (player.cores >= need && Math.hypot(player.x - beacon.x, player.y - beacon.y) <= reach) {
    extract(ctx);
  }
}
