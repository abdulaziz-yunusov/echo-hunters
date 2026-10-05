import { afterEach, describe, expect, it } from 'vitest';
import { EMITTER_TYPES } from '@/config/emitters';
import { GAME } from '@/config/game';
import { SOUND_KINDS, type SoundKindId } from '@/config/sounds';
import { setHunterState } from '@/sim/ai/hunterBrain';
import type { Player } from '@/sim/entities/player';
import type { GameEvents } from '@/sim/events';
import { IDLE_INPUT, type PlayerInput } from '@/sim/playerInput';
import type { Simulation } from '@/sim/simulation';
import { dropCores, extractionProgress, hitPlayer, startExtraction } from '@/sim/systems/duel';
import { simFromAscii, TS } from '../../helpers/maps';

const DT = 1 / 60;
const { carryHumInterval, extractTime } = GAME.duel;

function place(p: Player, x: number, y: number) {
  p.x = p.prevX = x;
  p.y = p.prevY = y;
}

function run(sim: Simulation, seconds: number, input: Partial<PlayerInput> = {}) {
  for (let i = 0; i < Math.round(seconds / DT); i++) sim.step({ ...IDLE_INPUT, ...input }, DT);
}

/** Every event of a type, collected from now on. */
function collect<K extends keyof GameEvents>(sim: Simulation, type: K): GameEvents[K][] {
  const seen: GameEvents[K][] = [];
  sim.events.on(type, (e) => seen.push(e));
  return seen;
}

/** The host's side of a duel on a long corridor; no hunters unless asked. */
function duelSim(
  rows = ['#'.repeat(40), '#P' + '.'.repeat(36) + 'P#', '#'.repeat(40)],
  hunters: 'stalker'[] = [],
) {
  const sim = simFromAscii(rows, { mode: 'host', hunters });
  return { sim, player: sim.state.player, rival: sim.state.rival! };
}

const humsOf = (sim: Simulation, owner: number) => {
  const kinds: SoundKindId[] = [];
  sim.events.on('soundEmitted', (s) => {
    if (s.owner === owner && SOUND_KINDS[s.kind].tags.includes('carry' as never))
      kinds.push(s.kind);
  });
  return kinds;
};

describe('carried cores hum (Phase 28)', () => {
  it(`every ${carryHumInterval} s while carrying, louder with enough to win`, () => {
    const { sim, player } = duelSim();
    const hums = humsOf(sim, player.id);
    run(sim, 10);
    expect(hums).toEqual([]); // nothing carried, nothing heard

    player.cores = 1;
    run(sim, carryHumInterval * 3 + 0.1);
    expect(hums).toEqual(['carriedHum', 'carriedHum', 'carriedHum']);

    player.cores = 2;
    run(sim, carryHumInterval);
    expect(hums.at(-1)).toBe('carriedHumHeavy');
    const heavy = SOUND_KINDS.carriedHumHeavy;
    const light = SOUND_KINDS.carriedHum;
    expect(heavy.hearRadius / light.hearRadius).toBeCloseTo(1.4, 5);
    expect(heavy.maxRadius / light.maxRadius).toBeCloseTo(1.4, 5);
  });

  it('sneaking and Silent Boots do not quiet it', () => {
    const { sim, player } = duelSim();
    const hums = humsOf(sim, player.id);
    player.cores = 1;
    player.silentTime = 60;
    run(sim, carryHumInterval * 2 + 0.1, { sneak: true, moveX: 1 });
    expect(hums).toHaveLength(2);
  });

  it('hunters hear it from about 220 px (308 with enough cores to win), the rings stay small', () => {
    const heard = (tiles: number, cores: number) => {
      const rows = [
        '#'.repeat(20),
        `#P${'.'.repeat(tiles - 1)}H${'.'.repeat(16 - tiles)}#`,
        '#'.repeat(20),
      ];
      const sim = simFromAscii(rows, { mode: 'host', hunters: ['stalker'] });
      setHunterState(sim, sim.state.hunters[0], 'stunned'); // stays put, still hears
      const events = collect(sim, 'hunterHeard');
      sim.state.player.cores = cores;
      run(sim, carryHumInterval + 2.5); // one hum, and time for it to arrive
      return events.length;
    };
    expect(heard(6, 1)).toBe(1); // 192 px
    expect(heard(7, 1)).toBe(0); // 224 px
    expect(heard(9, 2)).toBe(1); // 288 px: the heavy hum
    expect(SOUND_KINDS.carriedHum.maxRadius).toBe(60);
  });

  it('a running vent or pipe hides it from everyone: no hum is made at all', () => {
    const { sim, player } = duelSim();
    const hums = humsOf(sim, player.id);
    const vent = {
      id: 1,
      type: 'vent' as const,
      x: player.x,
      y: player.y,
      timer: 99,
      activeLeft: 99,
    };
    sim.state.emitters = [vent];
    player.cores = 1;
    run(sim, carryHumInterval * 2 + 0.1);
    expect(hums).toEqual([]);
    // Out of its reach (or once it stops), the hum is back.
    place(player, player.x + EMITTER_TYPES.vent.maskRadius + 20, player.y);
    run(sim, carryHumInterval);
    expect(hums).toEqual(['carriedHum']);
  });
});

describe('extraction takes time (Phase 28)', () => {
  /** The host's player carries 2 cores; the beacon is 3 tiles away. */
  function atBeacon() {
    const rows = ['############', '#P..B.....P#', '############'];
    const d = duelSim(rows);
    d.player.cores = 2;
    run(d.sim, DT); // the beacon wakes
    const { beacon } = d.sim.state;
    return { ...d, beacon };
  }

  it(`completes after ${extractTime} s standing at the beacon`, () => {
    const { sim, player, beacon } = atBeacon();
    const started = collect(sim, 'extractStarted');
    place(player, beacon.x, beacon.y);
    run(sim, DT);
    expect(started).toEqual([{ by: player.id }]);
    run(sim, extractTime - 0.2);
    expect(sim.state.duel!.winner).toBeNull();
    expect(extractionProgress(sim.state)).toBeGreaterThan(0.8);
    run(sim, 0.3);
    expect(sim.state.duel!.winner).toBe(player.id);
    expect(sim.state.status).toBe('extracted');
  });

  it('stepping away starts it over', () => {
    const { sim, player, beacon } = atBeacon();
    const cancelled = collect(sim, 'extractCancelled');
    place(player, beacon.x, beacon.y);
    run(sim, extractTime - 0.3);
    place(player, beacon.x + 3 * TS, beacon.y);
    run(sim, DT);
    expect(cancelled).toEqual([{ by: player.id }]);
    expect(sim.state.duel!.extracting).toBeNull();
    place(player, beacon.x, beacon.y);
    run(sim, extractTime - 0.3);
    expect(sim.state.duel!.winner).toBeNull(); // the clock started again from zero
    run(sim, 0.4);
    expect(sim.state.duel!.winner).toBe(player.id);
  });

  it('a hit starts it over', () => {
    const { sim, player, rival, beacon } = atBeacon();
    place(player, beacon.x, beacon.y);
    run(sim, 1);
    hitPlayer(sim, player, player.x + 10, player.y, rival.id);
    expect(sim.state.duel!.extracting).toBeNull();
    expect(sim.state.duel!.winner).toBeNull();
  });

  it('is never granted without enough cores', () => {
    const { sim, player, rival, beacon } = atBeacon();
    rival.cores = 1;
    expect(startExtraction(sim, rival.id)).toBe(false); // the beacon is awake, but not for them
    player.cores = 1;
    place(player, beacon.x, beacon.y);
    run(sim, extractTime + 1);
    expect(sim.state.duel!.extracting).toBeNull();
    expect(sim.state.duel!.winner).toBeNull();
  });

  it('a carrier who loses the cores mid-way stops', () => {
    const { sim, rival } = atBeacon();
    const p = sim.state.player;
    p.cores = 0;
    rival.cores = 2;
    run(sim, DT);
    expect(startExtraction(sim, rival.id)).toBe(true);
    run(sim, 0.5);
    dropCores(sim, rival);
    run(sim, DT);
    expect(sim.state.duel!.extracting).toBeNull();
    run(sim, extractTime);
    expect(sim.state.duel!.winner).toBeNull();
  });

  it('the beacon pulses faster while someone extracts', () => {
    const { sim, player, beacon } = atBeacon();
    const before = sim.state.beacon.pulseTimer;
    run(sim, 0.5);
    const idle = before - sim.state.beacon.pulseTimer;
    place(player, beacon.x, beacon.y);
    run(sim, DT);
    const at = sim.state.beacon.pulseTimer;
    run(sim, 0.5);
    expect(at - sim.state.beacon.pulseTimer).toBeCloseTo(idle * GAME.duel.extractPulseSpeedup, 5);
  });
});

describe('steals (Phase 28)', () => {
  afterEach(() => {
    (GAME.duel as { dropScatterTiles: number }).dropScatterTiles = 0;
  });

  it("taking the rival's dropped cores is a steal; taking your own back is not", () => {
    const { sim, player, rival } = duelSim();
    const steals = collect(sim, 'coreStolen');
    place(rival, player.x + 3 * TS, player.y);
    rival.cores = 1;
    dropCores(sim, rival);
    const [loose] = sim.state.cores.filter((c) => c.dropped);
    place(player, loose.x, loose.y);
    run(sim, DT);
    expect(steals).toEqual([{ by: player.id, from: rival.id, x: loose.x, y: loose.y }]);

    player.cores = 1;
    dropCores(sim, player);
    run(sim, GAME.duel.dropLockSeconds + 0.1); // wait out the lock, standing on them
    expect(player.cores).toBe(1);
    expect(steals).toHaveLength(1);
  });

  it('dropped cores can scatter (a tuning option, off by default)', () => {
    expect(GAME.duel.dropScatterTiles).toBe(0);
    (GAME.duel as { dropScatterTiles: number }).dropScatterTiles = 1;
    const drop = () => {
      const rows = ['#######', '#.....#', '#P...P#', '#.....#', '#######'];
      const { sim, player } = duelSim(rows);
      place(player, 3 * TS + TS / 2, 2 * TS + TS / 2);
      player.cores = 2;
      dropCores(sim, player);
      return sim.state.cores.filter((c) => c.dropped).map((c) => ({ x: c.x, y: c.y }));
    };
    const spots = drop();
    expect(drop()).toEqual(spots); // seeded
    for (const s of spots) {
      expect(Math.abs(s.x - (3 * TS + TS / 2))).toBeLessThanOrEqual(TS);
      expect(Math.abs(s.y - (2 * TS + TS / 2))).toBeLessThanOrEqual(TS);
    }
  });
});
