import { GAME } from '@/config/game';
import { THEME } from '@/config/theme';
import type { GameState } from '@/sim/gameState';
import { drawText } from './text';

const PING_BLOCKS = 4;

/**
 * Heads-up display, top-left, monospace (GDD §9). Phase 4 shows the ping
 * cooldown; HP, cores and stones join in Phase 5.
 */
export function drawHud(ctx: CanvasRenderingContext2D, state: GameState): void {
  const { pingCooldown } = state.player;
  const ready = 1 - pingCooldown / GAME.abilities.ping.cooldown;
  const filled = Math.floor(ready * PING_BLOCKS + 1e-9);
  const bar = '▓'.repeat(filled) + '░'.repeat(PING_BLOCKS - filled);

  drawText(ctx, `PING ${bar}`, 12, 22, {
    size: 14,
    color: pingCooldown === 0 ? THEME.colors.cyan : THEME.colors.white,
    alpha: pingCooldown === 0 ? 1 : 0.5,
    glow: pingCooldown === 0 ? 6 : 0,
  });
}
