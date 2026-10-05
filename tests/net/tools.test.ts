import { describe, expect, it } from 'vitest';
import { TOOLS } from '@/config/pickups';
import { setHunterState } from '@/sim/ai/hunterBrain';
import type { GameEvents } from '@/sim/events';
import type { Simulation } from '@/sim/simulation';
import { rivalRevealed } from '@/sim/systems/tools';
import { duel, DUEL_DT, floorAt, teleport } from '../helpers/duel';

function collect<K extends keyof GameEvents>(sim: Simulation, type: K): GameEvents[K][] {
  const seen: GameEvents[K][] = [];
  sim.events.on(type, (e) => seen.push(e));
  return seen;
}

/** A free floor spot well away from both spawns (the first stone bag's tile). */
function openSpot(sim: Simulation) {
  const p = sim.state.pickups.find((q) => q.type === 'stoneBag')!;
  return floorAt(sim, p.x, p.y);
}

describe.each([0, 4, 8])('duel tools over the network, %i ticks of lag', (lag) => {
  it("the host judges the client's trap: it fires once, on the host's player, never on its owner", () => {
    const { host, client, step, settle } = duel(lag);
    const hostFired = collect(host, 'trapFired');
    const clientFired = collect(client, 'trapFired');
    const me = client.state.player;
    const spot = openSpot(host);
    teleport(me, spot.x, spot.y);
    settle();
    me.tool = 'trapKit';
    step({}, { useTool: true });
    settle();
    expect(client.state.traps).toHaveLength(1);
    expect(host.state.traps).toEqual([{ ...client.state.traps[0], owner: 2 }]);
    step({}, {}, 60); // the client stands on its own trap: nothing
    expect(hostFired).toEqual([]);

    teleport(me, spot.x + 200, spot.y); // walk off (the host sees it a little later)
    settle();
    teleport(host.state.player, spot.x, spot.y);
    step({}, {}, 1);
    settle();
    step({}, {}, 30);
    expect(hostFired).toHaveLength(1);
    expect(hostFired[0]).toMatchObject({ owner: 2, victim: 1 });
    expect(clientFired).toEqual(hostFired);
    expect(client.state.traps).toEqual([]);
    expect(host.state.traps).toEqual([]);
  });

  it('the client sees its victim through walls, and hears the snap', () => {
    const { host, client, step, settle } = duel(lag);
    const snaps = collect(client, 'soundEmitted');
    const me = client.state.player;
    const spot = openSpot(host);
    teleport(me, spot.x, spot.y);
    settle();
    me.tool = 'trapKit';
    step({}, { useTool: true });
    teleport(me, spot.x + 200, spot.y);
    settle();
    teleport(host.state.player, spot.x, spot.y);
    let revealed = false;
    for (let i = 0; i < 2 * lag + 10; i++) {
      step();
      revealed ||= rivalRevealed(client.state);
    }
    expect(revealed).toBe(true);
    expect(snaps.some((s) => s.kind === 'trapSnap')).toBe(true);
  });

  it("the host's traps stay secret from the client until one catches them", () => {
    const { host, client, step, settle } = duel(lag);
    const caught = collect(client, 'trapFired');
    const spot = openSpot(host);
    teleport(host.state.player, spot.x, spot.y);
    host.state.player.tool = 'trapKit';
    step({ useTool: true });
    teleport(host.state.player, spot.x - 200, spot.y);
    settle();
    expect(host.state.traps).toHaveLength(1);
    expect(client.state.traps).toEqual([]); // it never heard of it
    teleport(client.state.player, spot.x, spot.y);
    step({}, {}, 2 * lag + 20);
    expect(caught.map((e) => [e.owner, e.victim])).toEqual([[1, 2]]);
  });

  it("the client's traps are capped on the host too", () => {
    const { host, client, step, settle } = duel(lag);
    const me = client.state.player;
    const spot = openSpot(host);
    for (let i = 0; i < TOOLS.trapKit.maxPerPlayer + 1; i++) {
      teleport(me, spot.x + i * 3, spot.y);
      me.tool = 'trapKit';
      step({}, { useTool: true });
    }
    settle();
    expect(host.state.traps).toHaveLength(TOOLS.trapKit.maxPerPlayer);
    expect(host.state.traps.map((t) => t.id)).toEqual(client.state.traps.map((t) => t.id));
  });

  it("a flare's reveal and its warning arrive on both sides, either way", () => {
    for (const [user, target] of [
      ['host', 'client'],
      ['client', 'host'],
    ] as const) {
      const d = duel(lag);
      const sims = { host: d.host, client: d.client };
      const warned = collect(sims[target], 'flareSeen');
      sims[user].state.player.tool = 'flare';
      d.step(user === 'host' ? { useTool: true } : {}, user === 'client' ? { useTool: true } : {});
      expect(rivalRevealed(sims[user].state)).toBe(true);
      d.step({}, {}, lag + 1);
      expect(warned).toHaveLength(1);
      const { duel: state, time } = sims[target].state;
      expect(state!.seenUntil).toBeGreaterThan(time);
      expect(sims[user].state.rival!.tool).toBeNull();
      d.step({}, {}, Math.round(TOOLS.flare.revealSeconds / DUEL_DT) + 1);
      expect(rivalRevealed(sims[user].state)).toBe(false);
    }
  });

  it("decoy steps reach the host as the client's own steps, hunters chase them, and they leave no trail", () => {
    const { host, client, step, settle } = duel(lag, ['stalker']);
    setHunterState(host, host.state.hunters[0], 'stunned');
    const arrived = collect(host, 'soundEmitted');
    const me = client.state.player;
    me.tool = 'decoySteps';
    me.silentTime = 99; // no real steps of its own
    const { tiles } = client.state.layout;
    const middle = { x: tiles.worldWidth / 2, y: tiles.worldHeight / 2 };
    step({}, { useTool: true, aim: middle });
    step({}, {}, 120);
    settle();
    const fake = arrived.filter((s) => s.owner === 2 && s.wave.decoy);
    expect(fake.length).toBeGreaterThan(3);
    // The client never moved: the steps came from somewhere it wasn't.
    expect(Math.hypot(host.state.rival!.x - me.x, host.state.rival!.y - me.y)).toBeLessThan(1);
    expect(fake.some((s) => Math.hypot(s.x - me.x, s.y - me.y) > 100)).toBe(true);
  });

  it('a tool swap on the client: the host drops the old one, and the client sees it on the floor', () => {
    const { host, client, settle } = duel(lag);
    const me = client.state.player;
    const tools = host.state.pickups.filter(
      (p) => p.type !== 'stoneBag' && p.type !== 'silentBoots',
    );
    const [a, b] = tools;
    teleport(me, a.x, a.y);
    settle();
    expect(me.tool).toBe(a.type);
    teleport(me, b.x, b.y);
    settle();
    expect(me.tool).toBe(b.type);
    const onHost = host.state.pickups.find((p) => p.type === a.type && !p.collected);
    const onClient = client.state.pickups.find((p) => p.type === a.type && !p.collected);
    expect(onHost).toMatchObject({ x: b.x, y: b.y, lockedFor: 2 });
    expect(onClient).toEqual(onHost);
    expect(host.state.rival!.tool).toBe(b.type);
  });
});
