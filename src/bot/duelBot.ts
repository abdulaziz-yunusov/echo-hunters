import { AUDIO_SOUNDS } from '@/config/audio';
import { DUEL_BOTS, type DuelBotId, type DuelBotLevel } from '@/config/duelBots';
import { GAME } from '@/config/game';
import type { SoundKindId } from '@/config/sounds';
import type { Vec2 } from '@/core/geometry';
import { Rng } from '@/core/rng';
import type { SoundEmitted } from '@/sim/events';
import type { PlayerInput } from '@/sim/playerInput';
import type { Simulation } from '@/sim/simulation';
import { frontPassedOver } from '@/sim/sound/soundWave';
import { isTool } from '@/config/pickups';
import type { Pickup } from '@/sim/entities/pickup';
import { coresNeeded, isLockedFor } from '@/sim/systems/duel';
import { rivalRevealed } from '@/sim/systems/tools';
import { hasLineOfSight } from '@/sim/world/visibility';
import { Bot } from './bot';

/** Rival sounds that happen away from the rival (a thrown stone lands elsewhere). */
const DECOY_SOUNDS: readonly SoundKindId[] = ['stoneImpact'];
/** A heard or seen position is worth chasing for this long (s). */
const CHASE_MEMORY = 8;
/** Shock only at a position at most this old (s). */
const SHOCK_FRESH = 0.5;
/** Arrived where the rival was last known (px): nobody there, stop chasing it. */
const GIVE_UP = 24;
/** A shaky hand may fire once the rival is this many shock radii away (a miss). */
const EARLY_REACH = 1.8;
/** Hunt a rival who carries more cores when last known within this distance (px), Phase 28. */
const HUNT_RANGE = 300;
/** A core with an awake hunter this close (px) is left alone for now. */
const GUARD_RADIUS = 56;
/** Duel tools (Phase 29): fetch a tool lying this close (px) when the slot is empty. */
const TOOL_DETOUR = 160;
/** A rival position at most this old (s) counts as "on my heels". */
const TOOL_FRESH = 2;
/** Fire a flare when the rival leads and hasn't been located for this long (s). */
const FLARE_AFTER = 3;
/** Set a trap at the beacon from this close (px). */
const TRAP_AT_BEACON = 40;
/** Use decoys or a trap behind when the rival is this close (px). */
const PURSUED = 280;

/** Where the rival was heard or seen, and when the bot knew it (sim time). */
export interface Sighting extends Vec2 {
  time: number;
}

export interface DuelBotOptions {
  /** How well it plays (default: hard, the Phase 25 bot). */
  level?: DuelBotId;
  /** Seeds its shaky hand, so a round can be played again exactly. */
  seed?: number;
}

/**
 * The careful bot with duel goals: take the nearest free core, head for the
 * beacon with enough of them, chase the carrier when the rival has woken the
 * beacon, and shock the rival when it is in reach and in sight.
 *
 * It plays fair: it knows where the rival is only from the rival's sounds
 * it could hear (the player's audio range) and from rings passing over the
 * rival (the pale outline a player would see). Never from the state directly.
 *
 * Its level (`DUEL_BOTS`) slows its reactions, shortens its hearing,
 * shakes its shockwave and takes its stones and tools away.
 *
 * Tools (Phase 29): it fetches one lying close by, then uses it when a
 * player would: a trap at the beacon the rival must reach, or behind it
 * when pursued while carrying; a flare when the rival leads and it has
 * lost them; decoy steps away from its route when pursued while carrying.
 */
export class DuelBot extends Bot {
  private readonly level: DuelBotLevel;
  private readonly rng: Rng;
  private rivalAt: Sighting | null = null;
  /** Sightings it hasn't reacted to yet. */
  private noticed: Sighting[] = [];
  /** What it was last going for ('chase' for the rival), and when it may start. */
  private goal: Vec2 | 'chase' | null = null;
  private thinkUntil = -Infinity;
  /** The sighting it last decided whether to fire early at. */
  private judged: Sighting | null = null;
  /** The tool it is fetching: kept until it is gone, so the bot doesn't dither at the edge of range. */
  private fetching: Pickup | null = null;
  private readonly off: () => void;

  constructor(sim: Simulation, options: DuelBotOptions = {}) {
    const level = DUEL_BOTS[options.level ?? 'hard'];
    super(sim, 'careful', { hearing: level.hearing, stones: level.tools });
    this.level = level;
    this.rng = new Rng(options.seed ?? 0);
    this.off = sim.events.on('soundEmitted', (s) => this.hear(s));
  }

  /** Where the rival was last heard or seen (once reacted to); null if never. */
  get lastKnownRival(): Readonly<Sighting> | null {
    return this.rivalAt;
  }

  /** Stop listening to the simulation. */
  dispose(): void {
    this.off();
  }

  override input(): PlayerInput {
    this.look();
    this.react();
    const input = super.input();
    // Thinking about a new goal holds its feet, not its reactions to hunters.
    const pace = this.thinking() ? 0 : this.level.pace;
    input.moveX *= pace;
    input.moveY *= pace;
    this.shock(input);
    if (this.level.tools) this.useTool(input);
    return input;
  }

  protected override nextTarget(): Vec2 | null {
    const { state } = this.sim;
    const { player, beacon } = state;
    if (player.cores >= coresNeeded(state)) return beacon;
    const chase = this.chaseTarget();
    // The beacon is awake and not for us: the rival carries the cores. Stop them.
    if (beacon.active) return chase ?? beacon;
    const tool = this.level.tools ? this.toolNearby() : null;
    if (tool) return tool;
    // The rival leads and we know where they are: knock the cores loose (2 hits) and steal them.
    const rival = state.rival;
    if (chase && rival && rival.cores > player.cores && dist(player, chase) <= HUNT_RANGE) {
      return chase;
    }
    const free = state.cores.filter(
      (c) => !c.collected && !isLockedFor(state, c, player.id) && !this.guarded(c),
    );
    if (free.length > 0) return this.nearest(free);
    return chase ?? beacon;
  }

  /**
   * A core with an awake hunter right on it (one it can hear): not worth
   * walking into until the hunter moves off. Without this, two bots could
   * keep diving for a core dropped next to an attacking Stalker, each hit
   * twice and dropping it again, for the whole round.
   */
  private guarded(core: Vec2): boolean {
    const { player, hunters } = this.sim.state;
    return hunters.some(
      (h) =>
        h.state !== 'stunned' &&
        dist(h, core) <= GUARD_RADIUS &&
        dist(player, h) <= this.hearingRange,
    );
  }

  /** A tool on the floor close by, if the slot is empty (once chosen, until it is gone). */
  private toolNearby(): Vec2 | null {
    const { player, pickups } = this.sim.state;
    const available = (p: Pickup) => isTool(p.type) && !p.collected && p.lockedFor !== player.id;
    if (player.tool || (this.fetching && !available(this.fetching))) this.fetching = null;
    if (player.tool) return null;
    if (!this.fetching) {
      const near = pickups.filter((p) => available(p) && dist(player, p) <= TOOL_DETOUR);
      this.fetching = near.length > 0 ? (this.nearest(near) as Pickup) : null;
    }
    return this.fetching;
  }

  /** Use the tool in hand when it helps (see the class comment). */
  private useTool(input: PlayerInput): void {
    const { state } = this.sim;
    const { player, beacon, rival, time } = state;
    if (!player.tool || input.useTool) return;
    const r = this.rivalAt;
    const pursued = r !== null && time - r.time <= TOOL_FRESH && dist(player, r) <= PURSUED;
    const carrying = player.cores > 0;
    const rivalLeads = (rival?.cores ?? 0) > player.cores;
    let use = false;
    switch (player.tool) {
      case 'trapKit':
        use =
          (beacon.active && rivalLeads && dist(player, beacon) <= TRAP_AT_BEACON) ||
          (carrying && pursued);
        break;
      case 'flare':
        use = rivalLeads && (r === null || time - r.time > FLARE_AFTER);
        break;
      case 'decoySteps':
        if (carrying && pursued && r) {
          use = true;
          // Send the fake steps the other way from the rival.
          input.aim = { x: player.x + (player.x - r.x), y: player.y + (player.y - r.y) };
        }
        break;
    }
    input.useTool = use;
  }

  /** A new goal waits for the reaction delay; meanwhile the bot stands still. */
  private thinking(): boolean {
    const delay = this.level.reactionDelay;
    if (delay <= 0) return false;
    const target = this.nextTarget();
    const goal = target !== null && target === this.rivalAt ? 'chase' : target;
    const { time } = this.sim.state;
    if (goal !== this.goal) {
      this.goal = goal;
      this.thinkUntil = time + delay;
    }
    return time < this.thinkUntil;
  }

  /**
   * Shock a rival it has just located in reach and in sight. A shaky hand
   * (shockAccuracy < 1) may fire as soon as the rival is near, and miss.
   */
  private shock(input: PlayerInput): void {
    const { player, walls, time } = this.sim.state;
    const r = this.rivalAt;
    if (input.shockwave || !r || time - r.time > SHOCK_FRESH || player.shockCooldown > 0) return;
    const reach = GAME.abilities.shockwave.effectRadius;
    const d = dist(player, r);
    if (d <= reach && hasLineOfSight(walls, player.x, player.y, r.x, r.y)) {
      input.shockwave = true;
    } else if (d <= reach * EARLY_REACH && r !== this.judged) {
      this.judged = r;
      if (!this.rng.chance(this.level.shockAccuracy)) input.shockwave = true;
    }
  }

  /** The last known rival position, while it is fresh and we aren't standing on it. */
  private chaseTarget(): Vec2 | null {
    const r = this.rivalAt;
    const { player, time } = this.sim.state;
    if (!r || time - r.time > CHASE_MEMORY || dist(player, r) <= GIVE_UP) return null;
    return r;
  }

  /** A rival sound within earshot tells where they are. */
  private hear(s: SoundEmitted): void {
    const { player, rival } = this.sim.state;
    if (!rival || s.owner !== rival.id || DECOY_SOUNDS.includes(s.kind)) return;
    const range =
      AUDIO_SOUNDS[s.kind].range * this.level.hearing * this.sim.state.rules.soundHearing;
    if (Math.hypot(s.x - player.x, s.y - player.y) > range) return;
    this.notice(s.x, s.y);
  }

  /** A ring (not the rival's own) passing over the rival shows their outline; so does a flare or a trap. */
  private look(): void {
    const { rival, waves } = this.sim.state;
    if (!rival) return;
    if (rivalRevealed(this.sim.state)) {
      this.notice(rival.x, rival.y);
      return;
    }
    const dt = 1 / GAME.loop.tickRate;
    for (const w of waves) {
      if (w.owner === rival.id || !frontPassedOver(w, rival.x, rival.y, dt)) continue;
      this.notice(rival.x, rival.y);
      return;
    }
  }

  private notice(x: number, y: number): void {
    const sighting = { x, y, time: this.sim.state.time + this.level.reactionDelay };
    if (this.level.reactionDelay > 0) this.noticed.push(sighting);
    else this.rivalAt = sighting;
  }

  /** Act on the newest sighting whose reaction delay has passed. */
  private react(): void {
    const { time } = this.sim.state;
    let i = 0;
    while (i < this.noticed.length && this.noticed[i].time <= time) i++;
    if (i === 0) return;
    this.rivalAt = this.noticed[i - 1];
    this.noticed = this.noticed.slice(i);
  }
}

function dist(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
