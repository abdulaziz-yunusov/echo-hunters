import { describe, expect, it } from 'vitest';
import { GAME } from '@/config/game';
import type { HunterTypeId } from '@/config/hunters';
import { Rng } from '@/core/rng';
import { createLoopbackPair } from '@/net/loopback';
import { NetSession } from '@/net/netSession';
import type { Player } from '@/sim/entities/player';
import { IDLE_INPUT, type PlayerInput } from '@/sim/playerInput';
import { createDuelSimulation, type Simulation } from '@/sim/simulation';
import { hitPlayer } from '@/sim/systems/duel';

const DT = 1 / 60;
const SEED = 20260929;

/** Host and client simulations joined by an in-memory link with `latency` ticks each way. */
function duel(latency = 3, hunters: HunterTypeId[] = []) {
  const link = createLoopbackPair(latency);
  const host = createDuelSimulation({ seed: SEED, role: 'host', hunters });
  const client = createDuelSimulation({ seed: SEED, role: 'client', hunters });
  const hostNet = new NetSession(host, link.a);
  const clientNet = new NetSession(client, link.b);
  const step = (
    hostInput: Partial<PlayerInput> = {},
    clientInput: Partial<PlayerInput> = {},
    ticks = 1,
  ) => {
    for (let i = 0; i < ticks; i++) {
      hostNet.tick(DT);
      clientNet.tick(DT);
      host.step({ ...IDLE_INPUT, ...hostInput }, DT);
      client.step({ ...IDLE_INPUT, ...clientInput }, DT);
      link.pump();
    }
  };
  const settle = () => step({}, {}, 40);
  return { host, client, hostNet, clientNet, step, settle };
}

/** Center of the floor tile under (x, y): a safe place to put someone. */
function floorAt(sim: Simulation, x: number, y: number) {
  const { tiles } = sim.state.layout;
  return tiles.center({ tx: tiles.toTile(x), ty: tiles.toTile(y) });
}

function teleport(p: Player, x: number, y: number) {
  p.x = p.prevX = x;
  p.y = p.prevY = y;
}

/** Everything contested must look the same on both machines. */
function expectSamePicture(host: Simulation, client: Simulation) {
  const h = host.state;
  const c = client.state;
  expect(c.cores.map((k) => [k.id, k.collected])).toEqual(h.cores.map((k) => [k.id, k.collected]));
  expect(c.player.cores).toBe(h.rival!.cores);
  expect(c.rival!.cores).toBe(h.player.cores);
  expect(c.beacon.active).toBe(h.beacon.active);
  // No core is ever lost or copied: carried + on the floor = the map's cores.
  const carried = h.player.cores + h.rival!.cores;
  const onFloor = h.cores.filter((k) => !k.collected).length;
  expect(carried + onFloor).toBe(h.cores.filter((k) => !k.dropped).length);
}

describe('duel (GDD §8)', () => {
  it('both machines build the same map, with each player at their own spawn', () => {
    const { host, client } = duel();
    expect(client.state.layout.tiles.tiles).toEqual(host.state.layout.tiles.tiles);
    expect(host.state.player.id).toBe(1);
    expect(client.state.player.id).toBe(2);
    expect(client.state.player.x).toBe(host.state.rival!.x);
    expect(host.state.player.x).not.toBe(client.state.player.x);
  });

  it("each side sees the other's position, gliding after a short delay", () => {
    const { host, client, step, settle } = duel();
    step({}, { moveX: 1, moveY: 1 }, 60);
    settle();
    expect(host.state.rival!.x).toBeCloseTo(client.state.player.x, 3);
    expect(host.state.rival!.y).toBeCloseTo(client.state.player.y, 3);
  });

  it("the rival's sounds reach this side, and the host's hunters hear them", () => {
    const { host, client, step } = duel(3, ['stalker']);
    const heard: { x: number; y: number }[] = [];
    const rings: string[] = [];
    host.events.on('hunterHeard', (e) => heard.push(e));
    host.events.on('soundEmitted', (s) => s.owner === 2 && rings.push(s.kind));
    // Put the client on the hunter's own tile so it certainly hears.
    const h = host.state.hunters[0];
    const spot = floorAt(host, h.x, h.y);
    teleport(client.state.player, spot.x, spot.y);
    step({}, {}, 20);
    step({}, { ping: true });
    step({}, {}, 30);
    expect(rings).toContain('ping');
    expect(heard.some((e) => Math.abs(e.x - client.state.player.x) < 1)).toBe(true);
  });

  it("the rival's beam reaches this side aimed the same way", () => {
    const { host, client, step } = duel(3, ['stalker']);
    const beams: (number | undefined)[] = [];
    host.events.on('soundEmitted', (s) => s.owner === 2 && beams.push(s.wave.arc?.dir));
    const p = client.state.player;
    const aim = { x: p.x + 100, y: p.y - 100 };
    step({}, { ping: true, pingHeld: true, aim });
    step({}, { pingHeld: true, aim }, Math.ceil(GAME.abilities.beam.chargeTime / DT) + 1);
    step({}, { aim });
    step({}, {}, 10);
    expect(beams).toHaveLength(1);
    expect(beams[0]).toBeCloseTo(-Math.PI / 4, 5);
  });

  it('a contested core goes to exactly one player, and both machines agree', () => {
    const { host, client, step, settle } = duel(3);
    const core = host.state.cores[0];
    teleport(host.state.player, core.x, core.y);
    teleport(client.state.player, core.x, core.y);
    step();
    settle();
    expectSamePicture(host, client);
    expect(host.state.cores[0].collected).toBe(true);
    expect(host.state.player.cores + host.state.rival!.cores).toBe(1);
    expect(client.state.duel!.pending).toEqual([]);
  });

  it('40 random races with random lag never disagree', () => {
    const rng = new Rng(7);
    for (let round = 0; round < 40; round++) {
      const { host, client, step, settle } = duel(rng.int(0, 8));
      for (const core of host.state.cores) {
        const who = rng.int(0, 2); // host, client or both
        const hostFirst = rng.chance(0.5);
        if (who !== 1 && hostFirst) teleport(host.state.player, core.x, core.y);
        if (who !== 0) teleport(client.state.player, core.x, core.y);
        step({}, {}, rng.int(0, 4));
        if (who !== 1 && !hostFirst) teleport(host.state.player, core.x, core.y);
        step({}, {}, rng.int(1, 6));
      }
      settle();
      expectSamePicture(host, client);
    }
  });

  it('two hits make a player drop their cores, on both machines', () => {
    const { host, client, step, settle } = duel();
    const core = host.state.cores[0];
    teleport(client.state.player, core.x, core.y);
    settle();
    expect(host.state.rival!.cores).toBe(1);

    const rival = host.state.rival!;
    hitPlayer(host, rival, rival.x + 1, rival.y, 100);
    step({}, {}, 70); // wait out the safety window
    hitPlayer(host, host.state.rival!, rival.x + 1, rival.y, 100);
    settle();
    expect(host.state.rival!.cores).toBe(0);
    expect(client.state.player.cores).toBe(0);
    const dropped = host.state.cores.filter((c) => c.dropped);
    expect(dropped).toHaveLength(1);
    expect(client.state.cores.filter((c) => c.dropped).map((c) => c.id)).toEqual(
      dropped.map((c) => c.id),
    );
    expectSamePicture(host, client);
  });

  it('whoever dropped cores cannot take them back for a moment', () => {
    const { host, client, step, settle } = duel();
    const core = host.state.cores[0];
    teleport(client.state.player, core.x, core.y);
    settle();
    const rival = host.state.rival!;
    hitPlayer(host, rival, rival.x + 1, rival.y, 100);
    step({}, {}, 70);
    hitPlayer(host, host.state.rival!, rival.x + 1, rival.y, 100);
    // The client stays on the spot where its cores fell.
    const spot = { x: client.state.player.x, y: client.state.player.y };
    for (let i = 0; i < 60; i++) {
      teleport(client.state.player, spot.x, spot.y);
      step();
    }
    expect(host.state.rival!.cores).toBe(0); // 1 s later: still locked
    for (let i = 0; i < 120; i++) {
      teleport(client.state.player, spot.x, spot.y);
      step();
    }
    settle();
    expect(host.state.rival!.cores).toBe(1); // lock over: picked back up
    expectSamePicture(host, client);
  });

  it("the client's shockwave is judged by the host, and hits the host", () => {
    const { host, client, step, settle } = duel();
    const p = host.state.player;
    const spot = floorAt(host, p.x, p.y); // same tile as the host: in reach and in sight
    teleport(client.state.player, spot.x, spot.y);
    const hostHits: number[] = [];
    host.events.on('playerHit', (e) => e.target === 1 && hostHits.push(e.hits));
    settle();
    step({}, { shockwave: true });
    settle();
    expect(hostHits).toEqual([1]);
    expect(client.state.duel!.hits[1]).toBe(1);
  });

  it('extracting with 2 cores wins, and the other side loses', () => {
    const { host, client, step, settle } = duel();
    for (const core of host.state.cores.slice(0, 2)) {
      teleport(client.state.player, core.x, core.y);
      settle();
    }
    expect(host.state.beacon.active).toBe(true);
    expect(client.state.beacon.active).toBe(true);
    const b = client.state.beacon;
    teleport(client.state.player, b.x, b.y);
    step();
    settle();
    expect(host.state.duel!.winner).toBe(2);
    expect(client.state.status).toBe('extracted');
    expect(host.state.status).toBe('lost');
  });

  it("hunters on the client follow the host's", () => {
    const { host, client, step } = duel(3, ['stalker']);
    step({ ping: true }, {}, 1);
    step({}, {}, 240);
    const h = host.state.hunters[0];
    const c = client.state.hunters[0];
    expect(Math.hypot(h.x - c.x, h.y - c.y)).toBeLessThan(40);
  });

  it('notices when the other side leaves', () => {
    const { hostNet, clientNet, step } = duel();
    let told = false;
    clientNet.onDisconnect(() => (told = true));
    hostNet.dispose();
    step({}, {}, 10);
    expect(told).toBe(true);
    expect(clientNet.disconnected).toBe(true);
  });
});
