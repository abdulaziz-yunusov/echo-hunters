import { GAME } from '@/config/game';
import { TOOLS } from '@/config/pickups';
import { THEME } from '@/config/theme';
import { beamCharged, beamReady } from '@/sim/entities/player';
import type { GameState } from '@/sim/gameState';
import { extractionProgress } from '@/sim/systems/duel';
import { playerMasked } from '@/sim/systems/emitters';
import { drawText } from './text';

const BAR_BLOCKS = 4;
const SIZE = 14;

/**
 * Heads-up display, top-left, monospace (GDD §9):
 * HP ●●○  CORES 1/3  STONES 2  PING ▓▓▓░  BEAM ▓░░░  SHOCK ▓▓░░
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
  /** A share (0..1) as blocks; bright when ready. */
  const meter = (label: string, share: number, ready: boolean, readyColor: string): void => {
    const filled = Math.floor(Math.min(1, share) * BAR_BLOCKS + 1e-9);
    part(
      `${label} ${'▓'.repeat(filled)}${'░'.repeat(BAR_BLOCKS - filled)}`,
      ready ? readyColor : white,
      ready ? 1 : 0.5,
      ready ? 6 : 0,
    );
  };
  const cooldown = (label: string, left: number, total: number, readyColor: string): void =>
    meter(label, 1 - left / total, left === 0, readyColor);
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
  // Duel tool slot (Phase 29).
  if (duel) {
    if (player.tool) part(`TOOL ${TOOLS[player.tool].label}`, THEME.colors.orange, 1, 6);
    else part('TOOL –', white, 0.35);
  }
  cooldown('PING', player.pingCooldown, state.rules.pingCooldown, THEME.colors.cyan);
  // While the ping key is held with the beam ready, the beam meter shows the charge.
  const { chargeTime, cooldown: beamTotal } = GAME.abilities.beam;
  if (player.pingHold !== null && beamReady(player)) {
    meter('BEAM', player.pingHold / chargeTime, beamCharged(player), THEME.colors.cyan);
  } else {
    meter('BEAM', 1 - player.beamCooldown / beamTotal, beamReady(player), THEME.colors.cyan);
  }
  cooldown('SHOCK', player.shockCooldown, GAME.abilities.shockwave.cooldown, THEME.colors.red);

  let line = y + 22;
  if (playerMasked(state) && !player.sneaking && player.silentTime <= 0) {
    drawText(ctx, 'MASKED: STEPS HIDDEN BY NOISE', 12, line, {
      size: 12,
      color: THEME.colors.white,
      alpha: 0.8,
    });
    line += 18;
  }
  if (duel && duel.overtimeAt !== null) {
    // Overtime (Phase 30): sudden death.
    drawText(ctx, `OVERTIME: ${duel.coresToWin} CORE WINS`, 12, line, {
      size: 13,
      color: THEME.colors.red,
      glow: 8,
    });
    line += 18;
  }
  if (duel && state.time < duel.seenUntil) {
    // The rival's flare (Phase 29): they can see you right now.
    drawText(ctx, 'YOU ARE SEEN', 12, line, {
      size: 13,
      color: THEME.colors.red,
      glow: 8,
      alpha: Math.floor(state.time * 6) % 2 === 0 ? 1 : 0.5,
    });
    line += 18;
  }
  if (player.decoy) {
    drawText(ctx, `DECOY STEPS ${Math.ceil(player.decoy.left)}s: YOUR STEPS ARE SILENT`, 12, line, {
      size: 12,
      color: THEME.colors.cyan,
      glow: 6,
    });
    line += 18;
  }
  if (player.silentTime > 0) {
    drawText(ctx, `SILENT BOOTS ${Math.ceil(player.silentTime)}s`, 12, line, {
      size: 12,
      color: THEME.colors.cyan,
      glow: 6,
    });
    line += 18;
  }
  // Phase 28: an extraction under way, yours (with its progress) or the rival's.
  const progress = extractionProgress(state);
  if (duel?.extracting && progress !== null) {
    const mine = duel.extracting.by === player.id;
    const filled = Math.floor(progress * 8);
    drawText(
      ctx,
      mine
        ? `EXTRACTING ${'▓'.repeat(filled)}${'░'.repeat(8 - filled)}: HOLD STILL`
        : 'RIVAL EXTRACTING: HIT THEM!',
      12,
      line,
      {
        size: 13,
        color: mine ? THEME.colors.green : THEME.colors.red,
        glow: 8,
        // The rival's warning blinks.
        alpha: mine || Math.floor(state.time * 4) % 2 === 0 ? 1 : 0.45,
      },
    );
    return;
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
