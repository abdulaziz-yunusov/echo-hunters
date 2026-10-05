import { describe, expect, it } from 'vitest';
import { GAME } from '@/config/game';
import type { GameEvents } from '@/sim/events';
import type { Simulation } from '@/sim/simulation';
import { hitPlayer } from '@/sim/systems/duel';
import { duel, DUEL_DT, EXTRACT_TICKS, teleport } from '../helpers/duel';

const { extractTime, carryHumInterval } = GAME.duel;

function collect<K extends keyof GameEvents>(sim: Simulation, type: K): GameEvents[K][] {
  const seen: GameEvents[K][] = [];
  sim.events.on(type, (e) => seen.push(e));
  return seen;
}

/** The client has picked up two cores and stands next to the awake beacon. */
function clientCarrying(lag: number) {
  const d = duel(lag);
  const me = d.client.state.player;
  for (const core of d.host.state.cores.slice(0, 2)) {
    teleport(me, core.x, core.y);
    d.settle();
  }
  expect(d.host.state.beacon.active).toBe(true);
  return { ...d, me, beacon: d.client.state.beacon };
}

describe.each([0, 3, 8])('carrier pressure over the network, %i ticks of lag', (lag) => {
  it('the host times the client’s extraction; both sides see it', () => {
    const { host, client, step, me, beacon } = clientCarrying(lag);
    const hostSaw = collect(host, 'extractStarted');
    const clientSaw = collect(client, 'extractStarted');
    teleport(me, beacon.x, beacon.y);
    step({}, {}, 2 * lag + 2);
    expect(hostSaw).toEqual([{ by: 2 }]);
    step({}, {}, lag + 1);
    expect(clientSaw).toEqual([{ by: 2 }]);
    expect(client.state.duel!.extracting?.by).toBe(2);
    step({}, {}, Math.floor((extractTime / DUEL_DT) * 0.5));
    expect(host.state.duel!.winner).toBeNull();
    step({}, {}, EXTRACT_TICKS);
    expect(host.state.duel!.winner).toBe(2);
    expect(client.state.status).toBe('extracted');
  });

  it('stepping away cancels it on both sides', () => {
    const { host, client, step, settle, me, beacon } = clientCarrying(lag);
    teleport(me, beacon.x, beacon.y);
    step({}, {}, 2 * lag + 30);
    teleport(me, beacon.x + 3 * GAME.map.tileSize, beacon.y);
    settle();
    expect(host.state.duel!.extracting).toBeNull();
    expect(client.state.duel!.extracting).toBeNull();
    step({}, {}, EXTRACT_TICKS);
    expect(host.state.duel!.winner).toBeNull();
  });

  it('a hit cancels it; still there, the client starts again and finishes', () => {
    const { host, client, step, settle, me, beacon } = clientCarrying(lag);
    const cancelled = collect(client, 'extractCancelled');
    teleport(me, beacon.x, beacon.y);
    step({}, {}, 2 * lag + 30);
    const rival = host.state.rival!;
    hitPlayer(host, rival, rival.x + 1, rival.y, 1);
    settle();
    expect(cancelled).toEqual([{ by: 2 }]);
    expect(host.state.duel!.winner).toBeNull();
    // Knocked back; walk (teleport) back onto the beacon.
    teleport(me, beacon.x, beacon.y);
    step({}, {}, EXTRACT_TICKS + 2 * lag);
    expect(host.state.duel!.winner).toBe(2);
  });

  it('a client claiming an extraction without enough cores is refused', () => {
    const { host, client, link, step } = duel(lag);
    link.b.send({ t: 'extract' });
    step({}, {}, EXTRACT_TICKS + 2 * lag);
    expect(host.state.duel!.extracting).toBeNull();
    expect(host.state.duel!.winner).toBeNull();
    expect(client.state.duel!.extracting).toBeNull();
  });

  it("the client's carried cores hum on the host too (hunters and the host hear it)", () => {
    const { host, client, step, settle } = duel(lag);
    const hums = collect(host, 'soundEmitted');
    const core = host.state.cores[0];
    teleport(client.state.player, core.x, core.y);
    settle();
    step({}, {}, Math.round(carryHumInterval / DUEL_DT) + lag + 2);
    expect(hums.some((s) => s.kind === 'carriedHum' && s.owner === 2)).toBe(true);
  });

  it('a steal is announced on both sides', () => {
    const { host, client, settle, step } = duel(lag);
    const hostSteals = collect(host, 'coreStolen');
    const clientSteals = collect(client, 'coreStolen');
    const core = host.state.cores[0];
    teleport(client.state.player, core.x, core.y);
    settle();
    const rival = host.state.rival!;
    hitPlayer(host, rival, rival.x + 1, rival.y, 1);
    step({}, {}, 70);
    hitPlayer(host, rival, rival.x + 1, rival.y, 1);
    settle();
    const loose = host.state.cores.find((c) => c.dropped && !c.collected)!;
    teleport(host.state.player, loose.x, loose.y);
    settle();
    expect(hostSteals.map((s) => [s.by, s.from])).toEqual([[1, 2]]);
    expect(clientSteals.map((s) => [s.by, s.from])).toEqual([[1, 2]]);
  });
});
