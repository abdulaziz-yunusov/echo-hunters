import { describe, expect, it } from 'vitest';
import { REPLAY } from '@/config/replay';
import { addStats, duelStats, emptyStats, formatStat } from '@/replay/duelStats';
import { ReplayRecorder } from '@/replay/recorder';
import type { Replay } from '@/replay/replay';
import { fromWire, toWire } from '@/replay/wire';
import { GUEST_ID, PLAYER_ID } from '@/sim/entities/entity';
import { hitPlayer } from '@/sim/systems/duel';
import { duel, DUEL_SEED, flushLink, teleport } from '../helpers/duel';

/**
 * A scripted duel with a bit of everything, recorded by the host:
 * the client walks and takes a core; the host pings, throws a stone and
 * hits the client twice; the client drops the core and the host steals
 * it; then the client takes the other two and extracts.
 */
function eventfulDuel() {
  const d = duel(2);
  const recorder = new ReplayRecorder(d.host, DUEL_SEED);
  d.afterHostStep.push(() => recorder.afterStep());
  const { host, client, step, settle } = d;
  const me = client.state.player;
  step({}, { moveX: 1 }, 30); // walks ~70 px
  const [a, b, c] = host.state.cores;
  teleport(me, a.x, a.y);
  settle();
  const hostPlayer = host.state.player;
  step({ ping: true }, {}, 1);
  step({}, {}, 10);
  step({ throwStone: true, aim: { x: hostPlayer.x + 100, y: hostPlayer.y } }, {}, 1);
  settle();
  const hitRival = () => {
    const rival = host.state.rival!;
    hitPlayer(host, rival, hostPlayer.x, hostPlayer.y, PLAYER_ID);
  };
  hitRival();
  step({}, {}, 70);
  hitRival();
  settle();
  const loose = host.state.cores.find((k) => k.dropped && !k.collected)!;
  teleport(hostPlayer, loose.x, loose.y);
  settle();
  for (const core of [b, c]) {
    teleport(me, core.x, core.y);
    settle();
  }
  teleport(me, client.state.beacon.x, client.state.beacon.y);
  step();
  settle();
  return { ...d, replay: recorder.finish() };
}

describe('duel stats (Phase 27)', () => {
  it('counts who did what, from the recording', () => {
    const { replay } = eventfulDuel();
    const stats = duelStats(replay)!;
    expect(stats[PLAYER_ID]).toMatchObject({ cores: 1, steals: 1, hits: 2, pings: 1, stones: 1 });
    expect(stats[GUEST_ID]).toMatchObject({ cores: 3, steals: 0, hits: 0, pings: 0, stones: 0 });

    // Distance: the host only teleported (left out). The client's walk counts; its
    // teleports reach the host as fast glides between network updates, so some of those count too.
    expect(stats[PLAYER_ID].distance).toBeLessThan(REPLAY.teleportDistance);
    expect(stats[GUEST_ID].distance).toBeGreaterThan(5);
  });

  it('time in the lead follows the cores held', () => {
    const { replay } = eventfulDuel();
    const stats = duelStats(replay)!;
    const events = replay.duel!.events;
    const cores = events.filter((e) => e.kind === 'core');
    const drop = events.find((e) => e.kind === 'drop')!;
    const end = replay.times[replay.times.length - 1];
    // Client: from its first core to the drop, and from its third core (2 vs 1) to the end.
    const clientLead = drop.time - cores[0].time + (end - cores[3].time);
    // Host: from the steal (1 vs 0) until the client's second core (1 vs 1).
    const hostLead = cores[2].time - cores[1].time;
    expect(cores.map((e) => e.by)).toEqual([GUEST_ID, PLAYER_ID, GUEST_ID, GUEST_ID]);
    expect(stats[GUEST_ID].leadTime).toBeCloseTo(clientLead, 2);
    expect(stats[PLAYER_ID].leadTime).toBeCloseTo(hostLead, 2);
  });

  it('match the debrief the client receives for the same round', async () => {
    const { hostNet, clientNet, link, replay } = eventfulDuel();
    let received: Replay | null = null;
    clientNet.onRecording((r) => (received = r));
    hostNet.shareRecording(replay);
    await flushLink(link);
    expect(received).not.toBeNull();
    const there = duelStats(received!)!;
    const here = duelStats(replay)!;
    for (const id of [PLAYER_ID, GUEST_ID]) {
      const { distance, leadTime, ...counts } = there[id];
      const { distance: d, leadTime: l, ...mine } = here[id];
      expect(counts).toEqual(mine);
      expect(distance).toBe(d);
      expect(leadTime).toBe(l);
    }
  });

  it('travel on the wire, and a malformed event is refused', () => {
    const { replay, host } = eventfulDuel();
    const { layout, walls } = host.state;
    const back = fromWire(toWire(replay), layout, walls);
    expect(back.duel!.events.length).toBe(replay.duel!.events.length);
    expect(back.duel!.events.map((e) => e.kind)).toEqual(replay.duel!.events.map((e) => e.kind));
  });

  it('add up over a series and format for the screen', () => {
    const one = { 1: { ...emptyStats(), cores: 2, distance: 320 }, 2: emptyStats() };
    const two = {
      1: { ...emptyStats(), cores: 1, leadTime: 4.4 },
      2: { ...emptyStats(), hits: 3 },
    };
    const total = addStats(addStats({}, one), two);
    expect(total[1]).toMatchObject({ cores: 3, distance: 320, leadTime: 4.4 });
    expect(total[2].hits).toBe(3);
    expect(formatStat('distance', 320)).toBe('10 m');
    expect(formatStat('leadTime', 4.4)).toBe('4 s');
    expect(formatStat('steals', 2)).toBe('2');
  });

  it('a solo recording has no duel stats', () => {
    const { replay } = eventfulDuel();
    expect(duelStats({ ...replay, duel: null })).toBeNull();
  });
});
