import { GAME } from '@/config/game';
import { THEME } from '@/config/theme';
import type { GameState } from '@/sim/gameState';
import { drawText } from './text';

const BAR_BLOCKS = 4;
const SIZE = 14;

/**
 * Heads-up display, top-left, monospace (GDD §9):
 * HP ●●○  CORES 1/3  STONES 2  PING ▓▓▓░  SHOCK ▓▓░░
 */
export function drawHud(ctx: CanvasRenderingContext2D, state: GameState): void {
  const { player, cores, beacon } = state;
  const white = THEME.colors.white;
  const y = 22;
  let x = 12;

  const part = (text: string, color: string, alpha = 1, glow = 0): void => {
    drawText(ctx, text, x, y, { size: SIZE, color, alpha, glow });
    x += ctx.measureText(text).width + 22;
  };
  /** A cooldown as blocks; bright when ready. */
  const cooldown = (label: string, left: number, total: number, readyColor: string): void => {
    const filled = Math.floor((1 - left / total) * BAR_BLOCKS + 1e-9);
    const ready = left === 0;
    part(
      `${label} ${'▓'.repeat(filled)}${'░'.repeat(BAR_BLOCKS - filled)}`,
      ready ? readyColor : white,
      ready ? 1 : 0.5,
      ready ? 6 : 0,
    );
  };
  ctx.font = `${SIZE}px ${THEME.font}`; // for measureText

  const duel = state.duel;
  if (duel) {
    // Duel (GDD §8): no HP; the shield is the hits left before you drop your cores.
    const left = duel.hitsToDrop - (duel.hits[player.id] ?? 0);
    part(`SHIELD ${'●'.repeat(left)}${'○'.repeat(duel.hitsToDrop - left)}`, THEME.colors.red);
    part(`CORES ${player.cores}/${duel.coresToWin}`, THEME.colors.cyan, player.cores > 0 ? 1 : 0.6);
    part(`RIVAL ${state.rival?.cores ?? 0}/${duel.coresToWin}`, THEME.colors.orange, 0.8);
  } else {
    part(`HP ${'●'.repeat(player.hp)}${'○'.repeat(player.maxHp - player.hp)}`, THEME.colors.red);
    const collected = cores.filter((c) => c.collected).length;
    part(`CORES ${collected}/${cores.length}`, THEME.colors.cyan, collected > 0 ? 1 : 0.6);
  }
  part(`STONES ${player.stones}`, white, player.stones > 0 ? 0.8 : 0.4);
  cooldown('PING', player.pingCooldown, state.rules.pingCooldown, THEME.colors.cyan);
  cooldown('SHOCK', player.shockCooldown, GAME.abilities.shockwave.cooldown, THEME.colors.red);

  let line = y + 22;
  if (player.silentTime > 0) {
    drawText(ctx, `SILENT BOOTS ${Math.ceil(player.silentTime)}s`, 12, line, {
      size: 12,
      color: THEME.colors.cyan,
      glow: 6,
    });
    line += 18;
  }
  if (beacon.active) {
    const rivalCarries = duel && player.cores < duel.coresToWin;
    drawText(
      ctx,
      rivalCarries ? 'RIVAL CARRIES THE CORES: STOP THEM!' : 'BEACON ACTIVE: GET TO EXTRACTION',
      12,
      line,
      {
        size: 12,
        color: THEME.colors.green,
        glow: 6,
      },
    );
  }
}
