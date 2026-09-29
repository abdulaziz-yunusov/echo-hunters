import { GAME } from '@/config/game';
import { THEME } from '@/config/theme';
import type { GameState } from '@/sim/gameState';
import { drawText } from './text';

const PING_BLOCKS = 4;
const SIZE = 14;

/** Heads-up display, top-left, monospace (GDD §9): HP ●●○  CORES 1/3  STONES 2  PING ▓▓▓░ */
export function drawHud(ctx: CanvasRenderingContext2D, state: GameState): void {
  const { player, cores, beacon } = state;
  const white = THEME.colors.white;
  const y = 22;
  let x = 12;

  const part = (text: string, color: string, alpha = 1, glow = 0): void => {
    drawText(ctx, text, x, y, { size: SIZE, color, alpha, glow });
    x += ctx.measureText(text).width + 22;
  };
  ctx.font = `${SIZE}px ${THEME.font}`; // for measureText

  part(`HP ${'●'.repeat(player.hp)}${'○'.repeat(player.maxHp - player.hp)}`, THEME.colors.red);
  const collected = cores.filter((c) => c.collected).length;
  part(`CORES ${collected}/${cores.length}`, THEME.colors.cyan, collected > 0 ? 1 : 0.6);
  part(`STONES ${player.stones}`, white, 0.8);

  const ready = 1 - player.pingCooldown / GAME.abilities.ping.cooldown;
  const filled = Math.floor(ready * PING_BLOCKS + 1e-9);
  const pingReady = player.pingCooldown === 0;
  part(
    `PING ${'▓'.repeat(filled)}${'░'.repeat(PING_BLOCKS - filled)}`,
    pingReady ? THEME.colors.cyan : white,
    pingReady ? 1 : 0.5,
    pingReady ? 6 : 0,
  );

  if (beacon.active) {
    drawText(ctx, 'BEACON ACTIVE: GET TO EXTRACTION', 12, y + 22, {
      size: 12,
      color: THEME.colors.green,
      glow: 6,
    });
  }
}
