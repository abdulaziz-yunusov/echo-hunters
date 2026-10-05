import { GAME } from '@/config/game';
import { HUNTER_TYPES, type HunterTypeId } from '@/config/hunters';
import { createSimulation } from '@/sim/simulation';
import { Bot, BOT_PROFILES, type BotProfile } from '@/bot/bot';
import { DUEL_VARIANTS, VARIANT_CHOICES, type VariantChoice } from '@/config/duel';
import { DUEL_BOTS, type DuelBotId } from '@/config/duelBots';
import { formatDuelTable, MAX_LAG, measureDuels, type BotPair } from './duelBalance';
import { UPGRADE_IDS, UPGRADES, type UpgradeId } from '@/config/upgrades';
import { MODIFIER_IDS, MODIFIERS, type ModifierId } from '@/config/modifiers';

/** A round the bot hasn't finished by then counts as failed (s). */
export const ROUND_LIMIT = 300;

export interface MeasureOptions {
  levels: readonly number[];
  /** Maps per level: run seeds 1..maps (each level's map comes from its run seed, like in play). */
  maps: number;
  profile: BotProfile;
  /** Replace every level's hunters (e.g. to measure one type). */
  hunters?: readonly HunterTypeId[];
  /** Upgrades the bot has on every level (Phase 20), one entry per stack. */
  upgrades?: readonly UpgradeId[];
  /** Force every level's modifier (Phase 21); null = none; unset = the run seed's, as in play. */
  modifier?: ModifierId | null;
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
  upgrades?: readonly UpgradeId[],
  modifier?: ModifierId | null,
): RoundOutcome {
  const sim = createSimulation({ seed, level, hunters, upgrades, modifier });
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
    outcomes.push(
      playRound(level, seed, options.profile, options.hunters, options.upgrades, options.modifier),
    );
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

/** One row of the upgrade table: an upgrade (or none), over every measured level together. */
export interface UpgradeStats {
  upgrade: UpgradeId | null;
  success: number;
  meanHits: number;
}

/**
 * Phase 20: each upgrade alone (one stack) against none, over the same
 * levels and maps. Shows whether one of them dominates.
 */
export function measureUpgrades(
  levels: readonly number[],
  maps: number,
  profile: BotProfile,
): UpgradeStats[] {
  const options: MeasureOptions = { levels, maps, profile };
  const pooled = (upgrade: UpgradeId | null): UpgradeStats => {
    const upgrades = upgrade ? [upgrade] : [];
    const stats = levels.map((level) => measureLevel(level, { ...options, upgrades }));
    const mean = (pick: (s: LevelStats) => number) =>
      stats.reduce((sum, s) => sum + pick(s), 0) / stats.length;
    return { upgrade, success: mean((s) => s.success), meanHits: mean((s) => s.meanHits) };
  };
  return [pooled(null), ...UPGRADE_IDS.map(pooled)];
}

/** The upgrade table, with each row's change from no upgrade. */
export function formatUpgradeTable(stats: readonly UpgradeStats[]): string {
  const base = stats[0];
  const pct = (v: number) => `${Math.round(v * 100)}%`;
  const signed = (v: number, digits: number, scale = 1) =>
    `${v >= 0 ? '+' : '−'}${Math.abs(v * scale).toFixed(digits)}`;
  const lines = [
    '| Upgrade | Success | Δ | Mean hits | Δ |',
    '| --- | --- | --- | --- | --- |',
    ...stats.map((s) => {
      const name = s.upgrade ? UPGRADES[s.upgrade].label : '(none)';
      if (!s.upgrade) return `| ${name} | ${pct(s.success)} | | ${s.meanHits.toFixed(2)} | |`;
      return `| ${name} | ${pct(s.success)} | ${signed(s.success - base.success, 1, 100)} | ${s.meanHits.toFixed(2)} | ${signed(s.meanHits - base.meanHits, 2)} |`;
    }),
  ];
  return lines.join('\n');
}

/**
 * Phase 21: every level played with each modifier forced on, and with
 * none, on the same maps. Row 0 is "none".
 */
export function measureModifiers(
  levels: readonly number[],
  maps: number,
  profile: BotProfile,
): { modifier: ModifierId | null; stats: LevelStats[] }[] {
  return [null, ...MODIFIER_IDS].map((modifier) => ({
    modifier,
    stats: levels.map((level) => measureLevel(level, { levels, maps, profile, modifier })),
  }));
}

/** Success per level for each modifier, with the change from none in brackets. */
export function formatModifierTable(rows: ReturnType<typeof measureModifiers>): string {
  const base = rows[0].stats;
  const pct = (v: number) => `${Math.round(v * 100)}%`;
  const lines = [
    `| Modifier | ${base.map((s) => `L${s.level}`).join(' | ')} | worst Δ |`,
    `| --- | ${base.map(() => '---').join(' | ')} | --- |`,
    ...rows.map(({ modifier, stats }) => {
      const name = modifier ? MODIFIERS[modifier].label : '(none)';
      const deltas = stats.map((s, i) => Math.round((s.success - base[i].success) * 100));
      const cells = stats.map((s, i) =>
        modifier ? `${pct(s.success)} (${deltas[i] >= 0 ? '+' : ''}${deltas[i]})` : pct(s.success),
      );
      const worst = modifier ? `${Math.min(...deltas)}` : '';
      return `| ${name} | ${cells.join(' | ')} | ${worst} |`;
    }),
  ];
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

const USAGE = `npm run balance -- [--levels 1-8] [--maps 40] [--profile basic|careful|all] [--hunters stalker,listener] [--upgrades quickPing,quickPing]
       npm run balance -- --upgrade-table [--levels 4-8] [--maps 40] [--profile all]
       npm run balance -- --modifier-table [--levels 5-10] [--maps 40] [--profile all]
       (--modifier blackout|…|none forces one on every level)
       npm run balance -- --duel [--maps 40] [--bots hard,easy] [--variant classic|…|random|all]`;

export interface CliOptions {
  levels: number[];
  maps: number;
  profiles: BotProfile[];
  hunters?: HunterTypeId[];
  /** The bot's upgrades on every level (Phase 20). */
  upgrades?: UpgradeId[];
  /** Compare each upgrade alone against none (Phase 20). */
  upgradeTable: boolean;
  /** Force a modifier on every level (Phase 21): an id, or null for none. */
  modifier?: ModifierId | null;
  /** Compare each modifier against none, level by level (Phase 21). */
  modifierTable: boolean;
  /** Measure duels (two duel bots) instead of solo levels. */
  duel: boolean;
  /** Duel bot levels to compare (the same one twice by default). */
  bots: BotPair;
  /** Duel arena variants to measure, one table each (Phase 30). */
  variants: VariantChoice[];
}

export function parseArgs(argv: readonly string[]): CliOptions {
  const options: CliOptions = {
    levels: parseLevels('1-8'),
    maps: 40,
    profiles: ['basic'],
    upgradeTable: false,
    modifierTable: false,
    duel: false,
    bots: ['hard', 'hard'],
    variants: ['classic'],
  };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (flag === '--duel') {
      options.duel = true;
      continue;
    }
    if (flag === '--upgrade-table') {
      options.upgradeTable = true;
      continue;
    }
    if (flag === '--modifier-table') {
      options.modifierTable = true;
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
    } else if (flag === '--upgrades') {
      const ids = value.split(',');
      for (const id of ids) {
        if (!(id in UPGRADES)) throw new Error(`Unknown upgrade ${id}.`);
      }
      options.upgrades = ids as UpgradeId[];
    } else if (flag === '--modifier') {
      if (value === 'none') options.modifier = null;
      else if (value in MODIFIERS) options.modifier = value as ModifierId;
      else throw new Error(`Unknown modifier ${value}.\n${USAGE}`);
    } else if (flag === '--variant') {
      if (value === 'all') options.variants = [...VARIANT_CHOICES];
      else if ((VARIANT_CHOICES as readonly string[]).includes(value)) {
        options.variants = [value as VariantChoice];
      } else throw new Error(`Unknown variant ${value}.\n${USAGE}`);
    } else if (flag === '--bots') {
      const levels = value.split(',');
      if (levels.length !== 2 || !levels.every((l) => l in DUEL_BOTS)) {
        throw new Error(
          `--bots needs two levels (${Object.keys(DUEL_BOTS).join(', ')}).\n${USAGE}`,
        );
      }
      options.bots = levels as BotPair;
    } else throw new Error(`Unknown option ${flag}.\n${USAGE}`);
  }
  return options;
}

/** Entry point (see tools/balance/run.mjs). Prints one table per profile, or the duel table. */
export function main(argv: readonly string[], log: (line: string) => void = console.log): void {
  const cli = parseArgs(argv);
  if (cli.duel) {
    const [a, b] = cli.bots.map((id: DuelBotId) => DUEL_BOTS[id].label.toLowerCase());
    for (const variant of cli.variants) {
      const started = Date.now();
      const stats = measureDuels(cli.maps, cli.bots, variant);
      const name = variant === 'random' ? 'RANDOM' : DUEL_VARIANTS[variant].label;
      log(`\n${a} duel bot vs ${b} · ${name} · ${cli.maps} maps · lag 0–${MAX_LAG} ticks\n`);
      log(formatDuelTable(stats));
      log(`\n(${((Date.now() - started) / 1000).toFixed(1)} s)`);
    }
    return;
  }
  if (cli.modifierTable) {
    for (const profile of cli.profiles) {
      const started = Date.now();
      const rows = measureModifiers(cli.levels, cli.maps, profile);
      log(`\n${profile} bot · each modifier forced on vs none · ${cli.maps} maps per level\n`);
      log(formatModifierTable(rows));
      log(`\n(${((Date.now() - started) / 1000).toFixed(1)} s)`);
    }
    return;
  }
  if (cli.upgradeTable) {
    for (const profile of cli.profiles) {
      const started = Date.now();
      const stats = measureUpgrades(cli.levels, cli.maps, profile);
      const levels = `levels ${cli.levels[0]}–${cli.levels[cli.levels.length - 1]}`;
      log(`\n${profile} bot · each upgrade alone · ${levels} · ${cli.maps} maps per level\n`);
      log(formatUpgradeTable(stats));
      log(`\n(${((Date.now() - started) / 1000).toFixed(1)} s)`);
    }
    return;
  }
  const note =
    (cli.hunters ? ` · hunters ${cli.hunters.join(',')}` : '') +
    (cli.upgrades ? ` · upgrades ${cli.upgrades.join(',')}` : '') +
    (cli.modifier !== undefined ? ` · modifier ${cli.modifier ?? 'none'}` : '');
  for (const profile of cli.profiles) {
    const started = Date.now();
    const stats = cli.levels.map((level) =>
      measureLevel(level, {
        levels: cli.levels,
        maps: cli.maps,
        profile,
        hunters: cli.hunters,
        upgrades: cli.upgrades,
        modifier: cli.modifier,
      }),
    );
    log(`\n${profile} bot · ${cli.maps} maps per level${note}\n`);
    log(formatTable(stats, 'Level'));
    log(`\n(${((Date.now() - started) / 1000).toFixed(1)} s)`);
  }
}
