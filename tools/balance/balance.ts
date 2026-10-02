import { GAME } from '@/config/game';
import { HUNTER_TYPES, type HunterTypeId } from '@/config/hunters';
import { createSimulation } from '@/sim/simulation';
import { Bot, BOT_PROFILES, type BotProfile } from './bot';
import { formatDuelTable, MAX_LAG, measureDuels } from './duelBalance';

/** A round the bot hasn't finished by then counts as failed (s). */
export const ROUND_LIMIT = 300;

export interface MeasureOptions {
  levels: readonly number[];
  /** Maps per level: run seeds 1..maps (each level's map comes from its run seed, like in play). */
  maps: number;
  profile: BotProfile;
  /** Replace every level's hunters (e.g. to measure one type). */
  hunters?: readonly HunterTypeId[];
}

export interface RoundOutcome {
  extracted: boolean;
  /** Round time (s): when it ended, or ROUND_LIMIT. */
  seconds: number;
  hits: number;
  timedOut: boolean;
}

export interface LevelStats {
  level: number;
  rounds: number;
  /** Share extracted, 0..1. */
  success: number;
  /** Mean time of the extracted rounds (s); NaN if none. */
  meanSeconds: number;
  meanHits: number;
  timeouts: number;
}

/** Play one round with the bot. Deterministic: the same arguments always give the same outcome. */
export function playRound(
  level: number,
  seed: number,
  profile: BotProfile,
  hunters?: readonly HunterTypeId[],
): RoundOutcome {
  const sim = createSimulation({ seed, level, hunters });
  const bot = new Bot(sim, profile);
  let hits = 0;
  sim.events.on('playerHit', (e) => {
    if (e.target === sim.state.player.id) hits++;
  });
  const dt = 1 / GAME.loop.tickRate;
  const ticks = ROUND_LIMIT * GAME.loop.tickRate;
  for (let i = 0; i < ticks && sim.state.status === 'playing'; i++) sim.step(bot.input(), dt);
  const { status, time } = sim.state;
  return {
    extracted: status === 'extracted',
    seconds: time,
    hits,
    timedOut: status === 'playing',
  };
}

export function measureLevel(level: number, options: MeasureOptions): LevelStats {
  const outcomes: RoundOutcome[] = [];
  for (let seed = 1; seed <= options.maps; seed++) {
    outcomes.push(playRound(level, seed, options.profile, options.hunters));
  }
  const won = outcomes.filter((o) => o.extracted);
  return {
    level,
    rounds: outcomes.length,
    success: won.length / outcomes.length,
    meanSeconds: won.length ? won.reduce((s, o) => s + o.seconds, 0) / won.length : NaN,
    meanHits: outcomes.reduce((s, o) => s + o.hits, 0) / outcomes.length,
    timeouts: outcomes.filter((o) => o.timedOut).length,
  };
}

/** A Markdown table in the DECISIONS.md style, one column per level. */
export function formatTable(stats: readonly LevelStats[], title: string): string {
  const row = (label: string, cells: string[]) => `| ${label} | ${cells.join(' | ')} |`;
  const lines = [
    row(
      title,
      stats.map((s) => `${s.level}`),
    ),
    row(
      '---',
      stats.map(() => '---'),
    ),
    row(
      'Success',
      stats.map((s) => `${Math.round(s.success * 100)}%`),
    ),
    row(
      'Mean time (s)',
      stats.map((s) => (isNaN(s.meanSeconds) ? '–' : s.meanSeconds.toFixed(0))),
    ),
    row(
      'Mean hits',
      stats.map((s) => s.meanHits.toFixed(2)),
    ),
  ];
  if (stats.some((s) => s.timeouts > 0)) {
    lines.push(
      row(
        'Timeouts',
        stats.map((s) => `${s.timeouts}`),
      ),
    );
  }
  return lines.join('\n');
}

/** "1-8" or "2,4,6" or "5" → level numbers. */
export function parseLevels(text: string): number[] {
  const levels: number[] = [];
  for (const part of text.split(',')) {
    const [a, b] = part.split('-').map((n) => Number.parseInt(n, 10));
    if (!Number.isInteger(a) || a < 1) throw new Error(`Bad level: ${part}`);
    const end = b === undefined ? a : b;
    if (!Number.isInteger(end) || end < a) throw new Error(`Bad level range: ${part}`);
    for (let l = a; l <= end; l++) levels.push(l);
  }
  return levels;
}

const USAGE = `npm run balance -- [--levels 1-8] [--maps 40] [--profile basic|careful|all] [--hunters stalker,listener]
       npm run balance -- --duel [--maps 40]`;

export interface CliOptions {
  levels: number[];
  maps: number;
  profiles: BotProfile[];
  hunters?: HunterTypeId[];
  /** Measure duels (two duel bots) instead of solo levels. */
  duel: boolean;
}

export function parseArgs(argv: readonly string[]): CliOptions {
  const options: CliOptions = {
    levels: parseLevels('1-8'),
    maps: 40,
    profiles: ['basic'],
    duel: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (flag === '--duel') {
      options.duel = true;
      continue;
    }
    const value = argv[i + 1];
    if (value === undefined) throw new Error(`${flag} needs a value.\n${USAGE}`);
    i++;
    if (flag === '--levels') options.levels = parseLevels(value);
    else if (flag === '--maps') options.maps = Math.max(1, Number.parseInt(value, 10) || 0);
    else if (flag === '--profile') {
      if (value === 'all') options.profiles = [...BOT_PROFILES];
      else if ((BOT_PROFILES as readonly string[]).includes(value)) {
        options.profiles = [value as BotProfile];
      } else throw new Error(`Unknown profile ${value}.\n${USAGE}`);
    } else if (flag === '--hunters') {
      const types = value.split(',');
      for (const t of types) {
        if (!(t in HUNTER_TYPES)) throw new Error(`Unknown hunter type ${t}.`);
      }
      options.hunters = types as HunterTypeId[];
    } else throw new Error(`Unknown option ${flag}.\n${USAGE}`);
  }
  return options;
}

/** Entry point (see tools/balance/run.mjs). Prints one table per profile, or the duel table. */
export function main(argv: readonly string[], log: (line: string) => void = console.log): void {
  const cli = parseArgs(argv);
  if (cli.duel) {
    const started = Date.now();
    const stats = measureDuels(cli.maps);
    log(`\nduel bot vs duel bot · ${cli.maps} maps · lag 0–${MAX_LAG} ticks\n`);
    log(formatDuelTable(stats));
    log(`\n(${((Date.now() - started) / 1000).toFixed(1)} s)`);
    return;
  }
  const note = cli.hunters ? ` · hunters ${cli.hunters.join(',')}` : '';
  for (const profile of cli.profiles) {
    const started = Date.now();
    const stats = cli.levels.map((level) =>
      measureLevel(level, { levels: cli.levels, maps: cli.maps, profile, hunters: cli.hunters }),
    );
    log(`\n${profile} bot · ${cli.maps} maps per level${note}\n`);
    log(formatTable(stats, 'Level'));
    log(`\n(${((Date.now() - started) / 1000).toFixed(1)} s)`);
  }
}
