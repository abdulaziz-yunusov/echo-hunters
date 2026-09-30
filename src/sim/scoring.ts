import { GAME } from '@/config/game';
import type { GameState } from './gameState';

export interface RoundResult {
  coresCollected: number;
  extracted: boolean;
  /** Round length in seconds. */
  seconds: number;
  pingsUsed: number;
  huntersStunned: number;
  closeCalls: number;
  /** Map area relative to the base map (1 = base size); bigger maps get more par time. */
  areaScale: number;
}

export interface ScoreBreakdown {
  cores: number;
  extraction: number;
  timeBonus: number;
  ghostBonus: number;
  stuns: number;
  closeCalls: number;
  total: number;
}

/** What a finished (or failed) round achieved, read from its state. */
export function roundResult(state: GameState): RoundResult {
  const { player, layout } = state;
  const base = (GAME.map.cellsX * 2 + 1) * (GAME.map.cellsY * 2 + 1);
  return {
    coresCollected: player.cores,
    extracted: state.status === 'extracted',
    seconds: state.time,
    pingsUsed: player.pingsUsed,
    huntersStunned: state.stats.huntersStunned,
    closeCalls: state.stats.closeCalls,
    areaScale: (layout.tiles.width * layout.tiles.height) / base,
  };
}

/**
 * Score one round (GDD §7). Pure: the same result always gives the same score.
 * Time and ghost bonuses only count when the player got out alive.
 */
export function scoreRound(r: RoundResult): ScoreBreakdown {
  const s = GAME.scoring;
  const par = s.parTime * r.areaScale;
  const cores = r.coresCollected * s.core;
  const extraction = r.extracted ? s.extraction : 0;
  const timeBonus = r.extracted
    ? Math.max(0, Math.round((par - r.seconds) * s.timeBonusPerSecond))
    : 0;
  const ghostBonus = r.extracted && r.pingsUsed === 0 ? s.ghostBonus : 0;
  const stuns = r.huntersStunned * s.hunterStunned;
  const closeCalls = Math.min(r.closeCalls, s.closeCallMax) * s.closeCall;
  return {
    cores,
    extraction,
    timeBonus,
    ghostBonus,
    stuns,
    closeCalls,
    total: cores + extraction + timeBonus + ghostBonus + stuns + closeCalls,
  };
}
