import { describe, expect, it } from 'vitest';
import { GAME } from '@/config/game';
import { DUEL_TOOLS, TOOLS, type ToolId } from '@/config/pickups';
import { SOUND_KINDS } from '@/config/sounds';
import { setHunterState } from '@/sim/ai/hunterBrain';
import type { Player } from '@/sim/entities/player';
import type { GameEvents } from '@/sim/events';
import { IDLE_INPUT, type PlayerInput } from '@/sim/playerInput';
import { createDuelSimulation, createSimulation, type Simulation } from '@/sim/simulation';
import { rivalRevealed } from '@/sim/systems/tools';
import { duelPickupCounts } from '@/sim/world/pickupPlacement';
import { simFromAscii, TS } from '../../helpers/maps';

const DT = 1 / 60;

function place(p: Player, x: number, y: number) {
  p.x = p.prevX = x;
  p.y = p.prevY = y;
}

function run(sim: Simulation, seconds: number, input: Partial<PlayerInput> = {}) {
  for (let i = 0; i < Math.round(seconds / DT); i++) sim.step({ ...IDLE_INPUT, ...input }, DT);
}

function collect<K extends keyof GameEvents>(sim: Simulation, type: K): GameEvents[K][] {
  const seen: GameEvents[K][] = [];
  sim.events.on(type, (e) => seen.push(e));
  return seen;
}

/** The host's side of a duel on an open hall; the rival far right. */
function hall(hunters: 'stalker'[] = []) {
  const rows = [
    '#'.repeat(30),
    ...Array.from(
      { length: 5 },
      (_, i) => `#${i === 2 ? 'P' : '.'}${'.'.repeat(26)}${i === 2 ? 'P' : '.'}#`,
    ),
    '#'.repeat(30),
  ];
  const sim = simFromAscii(rows, { mode: 'host', hunters });
  return { sim, player: sim.state.player, rival: sim.state.rival! };
}

/** Put a tool on the floor at (x, y). */
function drop(sim: Simulation, type: ToolId, x: number, y: number) {
  const id = sim.state.pickups.length + 1;
  sim.state.pickups.push({ id, type, x, y, collected: false });
  return id;
}

const use = { useTool: true };

describe('duel pickups (Phase 29)', () => {
  it(`are the duel's stones and boots plus ${GAME.duel.toolsPerMap} tools picked by the seed`, () => {
    const seen = new Set<ToolId>();
    for (let seed = 1; seed <= 30; seed++) {
      const counts = duelPickupCounts(seed);
      expect(counts).toMatchObject(GAME.duel.pickups);
      const tools = DUEL_TOOLS.filter((t) => counts[t]);
      expect(tools).toHaveLength(GAME.duel.toolsPerMap);
      tools.forEach((t) => seen.add(t));
      expect(duelPickupCounts(seed)).toEqual(counts);
    }
    expect([...seen].sort()).toEqual([...DUEL_TOOLS].sort()); // every tool shows up on some maps
  });

  it('both players get the same ones; solo levels get none', () => {
    const host = createDuelSimulation({ seed: 11, role: 'host' }).state.pickups;
    const client = createDuelSimulation({ seed: 11, role: 'client' }).state.pickups;
    expect(client).toEqual(host);
    expect(host.filter((p) => (DUEL_TOOLS as readonly string[]).includes(p.type))).toHaveLength(2);
    for (let level = 1; level <= 8; level++) {
      const solo = createSimulation({ seed: 11, level }).state.pickups;
      expect(solo.some((p) => (DUEL_TOOLS as readonly string[]).includes(p.type))).toBe(false);
    }
  });
});

describe('one tool slot', () => {
  it('a new tool swaps out the old one, which stays on the floor, locked until you step away', () => {
    const { sim, player } = hall();
    const dropped = collect(sim, 'toolDropped');
    drop(sim, 'flare', player.x + TS, player.y);
    drop(sim, 'trapKit', player.x + 3 * TS, player.y);
    place(player, player.x + TS, player.y);
    run(sim, DT);
    expect(player.tool).toBe('flare');

    place(player, player.x + 2 * TS, player.y);
    run(sim, DT);
    expect(player.tool).toBe('trapKit');
    expect(dropped).toHaveLength(1);
    const old = sim.state.pickups.find((p) => p.id === dropped[0].pickup.id)!;
    expect(old).toMatchObject({ type: 'flare', collected: false, lockedFor: player.id });

    run(sim, 1); // standing on it: no swapping back and forth
    expect(player.tool).toBe('trapKit');
    place(player, player.x, player.y + 2 * TS);
    run(sim, DT);
    expect(old.lockedFor).toBeUndefined();
    place(player, old.x, old.y);
    run(sim, DT);
    expect(player.tool).toBe('flare');
  });

  it('using an empty slot does nothing; a used tool is gone', () => {
    const { sim, player } = hall();
    const used = collect(sim, 'toolUsed');
    run(sim, DT, use);
    expect(used).toEqual([]);
    player.tool = 'flare';
    run(sim, DT, use);
    expect(player.tool).toBeNull();
    expect(used.map((e) => e.tool)).toEqual(['flare']);
  });
});

describe('Trap Kit', () => {
  it('is set at your feet, never fires on you, and the oldest goes past the cap', () => {
    const { sim, player } = hall();
    const fired = collect(sim, 'trapFired');
    for (let i = 0; i < TOOLS.trapKit.maxPerPlayer + 1; i++) {
      player.tool = 'trapKit';
      place(player, 100 + i * 2 * TS, player.y);
      run(sim, DT, use);
    }
    const mine = sim.state.traps.filter((t) => t.owner === player.id);
    expect(mine).toHaveLength(TOOLS.trapKit.maxPerPlayer);
    expect(mine.map((t) => t.x)).toEqual([100 + 2 * TS, 100 + 4 * TS]); // the first one is gone
    run(sim, 1);
    expect(fired).toEqual([]); // standing on your own trap
  });

  it('fires once when the rival steps near: a loud snap there, and their outline for you', () => {
    const { sim, player, rival } = hall();
    const fired = collect(sim, 'trapFired');
    const snaps = collect(sim, 'soundEmitted');
    player.tool = 'trapKit';
    run(sim, DT, use);
    const trap = sim.state.traps[0];
    place(player, player.x, player.y + 2 * TS); // step off it
    place(rival, trap.x + TOOLS.trapKit.triggerRadius + 4, trap.y);
    run(sim, DT);
    expect(fired).toEqual([]);
    place(rival, trap.x + TOOLS.trapKit.triggerRadius - 4, trap.y);
    run(sim, DT);
    expect(fired).toEqual([
      { owner: player.id, victim: rival.id, id: trap.id, x: trap.x, y: trap.y },
    ]);
    expect(snaps.filter((s) => s.kind === 'trapSnap')).toHaveLength(1);
    expect(sim.state.traps).toEqual([]);
    expect(rivalRevealed(sim.state)).toBe(true);
    run(sim, TOOLS.trapKit.revealSeconds);
    expect(rivalRevealed(sim.state)).toBe(false);
    expect(fired).toHaveLength(1); // only once
    expect(SOUND_KINDS.trapSnap.tags).toContain('impact'); // hunters come
  });
});

describe('Flare', () => {
  it('shows you the rival through walls for a moment', () => {
    const { sim, player } = hall();
    player.tool = 'flare';
    run(sim, DT, use);
    expect(rivalRevealed(sim.state)).toBe(true);
    run(sim, TOOLS.flare.revealSeconds);
    expect(rivalRevealed(sim.state)).toBe(false);
  });
});

describe('Decoy Steps', () => {
  it('walks fake footsteps toward the aim for a while, and your own steps go quiet', () => {
    const { sim, player } = hall();
    const steps = collect(sim, 'soundEmitted');
    const start = { x: player.x, y: player.y };
    player.tool = 'decoySteps';
    run(sim, DT, { ...use, aim: { x: player.x + 500, y: player.y } });
    run(sim, TOOLS.decoySteps.seconds, { moveY: 1 }); // the player walks the other way meanwhile

    const fake = steps.filter((s) => s.wave.decoy);
    const stride = GAME.player.speed * GAME.player.footstepInterval;
    const expected = Math.floor((GAME.player.speed * TOOLS.decoySteps.seconds) / stride);
    expect(fake.length).toBeGreaterThanOrEqual(expected - 1);
    expect(fake.every((s) => s.owner === player.id && s.y === start.y)).toBe(true);
    expect(fake.map((s) => s.x)).toEqual([...fake.map((s) => s.x)].sort((a, b) => a - b));
    const real = steps.filter((s) => !s.wave.decoy && s.owner === player.id);
    expect(real).toEqual([]); // silent while the decoy walks
    expect(player.decoy).toBeNull(); // over
    // Afterwards, walking makes steps again.
    run(sim, 1, { moveY: -1 });
    expect(steps.some((s) => !s.wave.decoy && s.owner === player.id)).toBe(true);
  });

  it('hunters hear the fake steps like real ones', () => {
    const rows = ['#'.repeat(20), `#P.....H${'.'.repeat(10)}P#`, '#'.repeat(20)];
    const sim = simFromAscii(rows, { mode: 'host', hunters: ['stalker'] });
    setHunterState(sim, sim.state.hunters[0], 'stunned');
    const heard = collect(sim, 'hunterHeard');
    const { player } = sim.state;
    player.tool = 'decoySteps';
    player.silentTime = 99; // the player makes no noise of their own
    run(sim, DT, { ...use, aim: { x: player.x + 400, y: player.y } });
    run(sim, 2);
    expect(heard.length).toBeGreaterThan(0);
  });
});
