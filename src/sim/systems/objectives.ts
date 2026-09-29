import { GAME } from '@/config/game';
import type { Player } from '../entities/player';
import type { SimContext } from '../gameState';

/**
 * The round's goal (GDD §2): collect every Signal Core, which wakes the
 * Extraction Beacon, then reach the beacon.
 */
export function updateObjectives(ctx: SimContext, player: Player, dt: number): void {
  const { state } = ctx;
  const cfg = GAME.objectives;
  const reach = cfg.pickupRadius + player.radius;

  for (const core of state.cores) {
    if (core.collected) continue;
    if (Math.hypot(player.x - core.x, player.y - core.y) <= reach) {
      core.collected = true;
      player.cores++;
      ctx.events.emit('coreCollected', { coreId: core.id, by: player.id, x: core.x, y: core.y });
      continue;
    }
    core.humTimer -= dt;
    if (core.humTimer <= 0) {
      ctx.emitSound('coreHum', core.x, core.y, null);
      core.humTimer += cfg.coreHumInterval;
    }
  }

  const beacon = state.beacon;
  if (!beacon.active) {
    if (state.cores.every((c) => c.collected)) {
      beacon.active = true;
      beacon.pulseTimer = 0; // first pulse right away
      ctx.events.emit('beaconActivated', { x: beacon.x, y: beacon.y });
    }
  }
  if (beacon.active) {
    beacon.pulseTimer -= dt;
    if (beacon.pulseTimer <= 0) {
      ctx.emitSound('beacon', beacon.x, beacon.y, null);
      beacon.pulseTimer += cfg.beaconPulseInterval;
    }
    if (Math.hypot(player.x - beacon.x, player.y - beacon.y) <= reach) {
      state.status = 'extracted';
      ctx.events.emit('roundEnded', { status: 'extracted', time: state.time });
    }
  }
}
