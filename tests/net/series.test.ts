import { describe, expect, it } from 'vitest';
import { GAME } from '@/config/game';
import { NetSession } from '@/net/netSession';
import type { DuelSeries } from '@/net/series';
import { packReplay } from '@/replay/wire';
import { GUEST_ID, PLAYER_ID } from '@/sim/entities/entity';
import { IDLE_INPUT } from '@/sim/playerInput';
import { createDuelSimulation } from '@/sim/simulation';
import {
  DUEL_DT,
  DUEL_SEED,
  EXTRACT_TICKS,
  flushLink,
  recordedDuel,
  seriesPair,
  teleport,
} from '../helpers/duel';

type Pair = ReturnType<typeof seriesPair>;

/** One round of the series, as the duel scenes run it, won by `winner` walking (teleporting) to the goal. */
function playRound(s: Pair, seed: number, winner: 'host' | 'client') {
  const sims = {
    host: createDuelSimulation({ seed, role: 'host', hunters: [], swapSpawns: s.host.swapSpawns }),
    client: createDuelSimulation({
      seed,
      role: 'client',
      hunters: [],
      swapSpawns: s.client.swapSpawns,
    }),
  };
  const nets = {
    host: new NetSession(sims.host, s.link.a, s.host.round),
    client: new NetSession(sims.client, s.link.b, s.client.round),
  };
  sims.host.events.on('duelEnded', (e) => s.host.finishRound(e.winner));
  sims.client.events.on('duelEnded', (e) => s.client.finishRound(e.winner));
  const tick = (n: number) => {
    for (let i = 0; i < n; i++) {
      nets.host.tick(DUEL_DT);
      nets.client.tick(DUEL_DT);
      sims.host.step(IDLE_INPUT, DUEL_DT);
      sims.client.step(IDLE_INPUT, DUEL_DT);
      s.link.pump();
    }
  };
  const me = sims[winner].state;
  for (const spot of [...me.cores.slice(0, 2), me.beacon]) {
    teleport(me.player, spot.x, spot.y);
    tick(30);
  }
  tick(EXTRACT_TICKS);
  return { sims, nets };
}

/** Both press READY (host first unless told otherwise), and the link delivers. */
function bothReady(s: Pair, first: DuelSeries = s.host) {
  const second = first === s.host ? s.client : s.host;
  first.markReady();
  s.link.pump();
  s.link.pump();
  second.markReady();
  for (let i = 0; i < 5; i++) s.link.pump();
}

/** Start the announced round on both sides; both must agree on it. */
function begin(s: Pair) {
  const a = s.host.begin();
  const b = s.client.begin();
  expect(a).not.toBeNull();
  expect(b).toEqual(a);
  return a!;
}

describe('duel series', () => {
  it('plays a full best of 3, swapping corners, then a rematch on the same link', () => {
    const s = seriesPair(3);
    expect(s.host.winsNeeded).toBe(2);

    let round = playRound(s, DUEL_SEED, 'host');
    for (const side of [s.host, s.client]) {
      expect(side.wins(PLAYER_ID)).toBe(1);
      expect(side.over).toBe(false);
    }
    round.nets.host.detach();
    round.nets.client.detach();

    bothReady(s);
    const second = begin(s);
    expect(second).toMatchObject({ round: 2, countdown: GAME.duel.series.countdown });
    expect(s.host.swapSpawns).toBe(true);
    round = playRound(s, second.seed, 'client');
    // Round 2: the host (standing still all round) started in the guest's corner.
    const { layout, player } = round.sims.host.state;
    expect({ x: player.x, y: player.y }).toEqual(layout.tiles.center(layout.spawns[1]));
    for (const side of [s.host, s.client]) {
      expect([side.wins(PLAYER_ID), side.wins(GUEST_ID)]).toEqual([1, 1]);
    }
    round.nets.host.detach();
    round.nets.client.detach();

    bothReady(s, s.client);
    const third = begin(s);
    expect(third.round).toBe(3);
    expect(s.client.swapSpawns).toBe(false);
    playRound(s, third.seed, 'host');
    for (const side of [s.host, s.client]) {
      expect(side.over).toBe(true);
      expect(side.champion).toBe(PLAYER_ID);
      expect(side.history.map((r) => r.winner)).toEqual([PLAYER_ID, GUEST_ID, PLAYER_ID]);
    }

    // Rematch: a new series at once, on the same connection.
    bothReady(s, s.client);
    const rematch = begin(s);
    expect(rematch).toMatchObject({ round: 1, countdown: 0 });
    for (const side of [s.host, s.client]) {
      expect(side.history).toEqual([]);
      expect(side.over).toBe(false);
      expect(side.rivalLeft).toBe(false);
    }
    // The maps differ from round to round.
    expect(new Set([DUEL_SEED, second.seed, third.seed, rematch.seed]).size).toBe(4);
  });

  it('a best of 1 is over after one round, and READY means a rematch', () => {
    const s = seriesPair(1);
    playRound(s, DUEL_SEED, 'client');
    expect(s.client.over).toBe(true);
    expect(s.client.champion).toBe(GUEST_ID);
    bothReady(s);
    expect(begin(s)).toMatchObject({ round: 1, countdown: 0 });
  });

  it('nothing starts until both are ready', () => {
    const s = seriesPair(3);
    playRound(s, DUEL_SEED, 'host');
    s.host.markReady();
    s.host.markReady(); // twice is once
    for (let i = 0; i < 5; i++) s.link.pump();
    expect(s.client.rivalIsReady).toBe(true);
    expect(s.host.upcoming).toBeNull();
    expect(s.client.upcoming).toBeNull();
  });

  const steps = [
    'during a round',
    'after a round, before anyone is ready',
    'after one is ready',
    'during the countdown',
    'at the end of the series, before a rematch',
  ] as const;

  for (const [index, step] of steps.entries()) {
    for (const leaver of ['host', 'client'] as const) {
      it(`a ${leaver} who leaves ${step} leaves the other side alone, told so`, () => {
        const s = seriesPair(index === 4 ? 1 : 3);
        const stayer = leaver === 'host' ? s.client : s.host;
        let lostRound = false;
        if (index === 0) {
          const sim = createDuelSimulation({ seed: DUEL_SEED, role: stayer.role, hunters: [] });
          new NetSession(sim, stayer === s.host ? s.link.a : s.link.b).onDisconnect(
            () => (lostRound = true),
          );
        } else {
          playRound(s, DUEL_SEED, 'host');
          if (index >= 2) s[leaver].markReady();
          if (index === 3) stayer.markReady();
          for (let i = 0; i < 5; i++) s.link.pump();
          if (index === 3) expect(stayer.upcoming).not.toBeNull();
        }
        s[leaver].leave();
        for (let i = 0; i < 5; i++) s.link.pump();
        expect(stayer.rivalLeft).toBe(true);
        if (index === 0) expect(lostRound).toBe(true);
        // Nothing more can start: pressing READY now does nothing.
        stayer.markReady();
        for (let i = 0; i < 5; i++) s.link.pump();
        if (index !== 3) expect(stayer.upcoming).toBeNull();
      });
    }
  }

  it("a round's recording never lands in the next round", async () => {
    const s = seriesPair(3);
    const data = await packReplay(recordedDuel().replay);
    const sim = createDuelSimulation({ seed: DUEL_SEED, role: 'client', hunters: [] });
    const net = new NetSession(sim, s.link.b, 2);
    let received = 0;
    net.onRecording(() => received++);
    s.link.a.send({ t: 'rec', data, round: 1 });
    await flushLink(s.link);
    expect(received).toBe(0);
    s.link.a.send({ t: 'rec', data, round: 2 });
    await flushLink(s.link);
    expect(received).toBe(1);
  });

  it('a detached round hears nothing more', () => {
    const s = seriesPair(3);
    const { nets, sims } = playRound(s, DUEL_SEED, 'host');
    nets.client.detach();
    s.link.a.send({ t: 'bye' });
    s.link.pump();
    s.link.pump();
    expect(nets.client.disconnected).toBe(false);
    expect(s.client.rivalLeft).toBe(true);
    expect(sims.client.state.duel!.winner).toBe(PLAYER_ID);
  });
});
