import { describe, expect, it } from 'vitest';
import { GAME } from '@/config/game';
import { createLoopbackPair } from '@/net/loopback';
import { NetSession } from '@/net/netSession';
import { peerOptions, usesRelay } from '@/net/peerTransport';
import type { NetMessage } from '@/net/protocol';
import { IDLE_INPUT, type PlayerInput } from '@/sim/playerInput';
import { createDuelSimulation } from '@/sim/simulation';
import { DUEL_DT, DUEL_SEED, EXTRACT_TICKS, linkedPair, teleport } from '../helpers/duel';

const { reconnectGrace, silence } = GAME.duel.link;

/** Let the client's async rejoin run, delivering on the (new) connection meanwhile. */
async function settleRejoin(pair: ReturnType<typeof linkedPair>, rounds = 10) {
  for (let i = 0; i < rounds; i++) {
    await Promise.resolve();
    pair.pump();
  }
}

/** Run both links for `seconds`, delivering every tick. */
function run(pair: ReturnType<typeof linkedPair>, seconds: number, deliver = true) {
  for (let i = 0; i < Math.round(seconds / DUEL_DT); i++) {
    pair.tick(DUEL_DT);
    if (deliver) pair.pump();
  }
}

describe('DuelLink (Phase 31)', () => {
  it('measures the round trip with its own heartbeat', () => {
    const pair = linkedPair(4);
    expect(pair.host.latency).toBeNull();
    run(pair, 3);
    // 4 ticks each way ≈ 133 ms there and back (give or take a tick).
    expect(pair.host.latency!).toBeGreaterThan(0.1);
    expect(pair.host.latency!).toBeLessThan(0.17);
    expect(pair.client.latency!).toBeGreaterThan(0.1);
  });

  it('a dropped connection is waited for, then the client rejoins with its token', async () => {
    const pair = linkedPair(2);
    let resumed = 0;
    pair.host.onResume(() => resumed++);
    run(pair, 1);
    pair.drop();
    expect(pair.host.state).toBe('reconnecting');
    expect(pair.client.state).toBe('reconnecting');
    await settleRejoin(pair);
    expect(pair.rejoins).toBe(1);
    expect(pair.host.state).toBe('open');
    expect(pair.client.state).toBe('open');
    expect(resumed).toBe(1);
    // Talking again, over the new connection.
    const got: NetMessage[] = [];
    pair.host.onMessage((m) => got.push(m));
    pair.client.send({ t: 'extract' });
    run(pair, 0.2);
    expect(got).toContainEqual({ t: 'extract' });
  });

  it('silence counts as a drop, so a dead network is noticed quickly', async () => {
    const pair = linkedPair(2);
    run(pair, 1);
    run(pair, silence + 0.5, false); // nothing gets through any more
    expect(pair.host.state).not.toBe('open');
    await settleRejoin(pair);
    expect(pair.host.state).toBe('open');
  });

  it('a rival who said they are away is not taken for a dead connection', () => {
    const pair = linkedPair(2);
    run(pair, 1);
    pair.client.setAway(true);
    run(pair, 0.2);
    // A hidden tab stops ticking: only the host's clock runs now.
    for (let i = 0; i < Math.round(10 / DUEL_DT); i++) pair.host.tick(DUEL_DT);
    expect(pair.host.state).toBe('open');
    expect(pair.host.rivalAway!).toBeGreaterThan(9.5);
    pair.client.setAway(false);
    run(pair, 0.2);
    expect(pair.host.rivalAway).toBeNull();
  });

  it('turns away a stranger without the token, and anyone while the rival is still there', () => {
    const pair = linkedPair(2);
    const stranger = createLoopbackPair(0);
    let closed = 0;
    stranger.b.onClose(() => closed++);
    pair.host.offer(stranger.a); // the rival is connected: no
    expect(closed).toBe(1);

    pair.setReachable(false);
    pair.drop();
    const impostor = createLoopbackPair(0);
    impostor.b.onClose(() => closed++);
    pair.host.offer(impostor.a);
    impostor.b.send({ t: 'rejoin', token: 'guess' });
    impostor.pump();
    expect(closed).toBe(2);
    expect(pair.host.state).toBe('reconnecting');
  });

  it(`gives up after ${reconnectGrace} s: both sides are told, once`, () => {
    const pair = linkedPair(2);
    pair.setReachable(false);
    let hostClosed = 0;
    let clientClosed = 0;
    pair.host.onClose(() => hostClosed++);
    pair.client.onClose(() => clientClosed++);
    pair.drop();
    run(pair, reconnectGrace - 0.5, false);
    expect(pair.host.state).toBe('reconnecting');
    expect(pair.host.secondsLeft).toBeCloseTo(0.5, 1);
    run(pair, 1, false);
    expect([pair.host.state, pair.client.state]).toEqual(['closed', 'closed']);
    expect([hostClosed, clientClosed]).toEqual([1, 1]);
  });

  it('a goodbye ends it at once: no waiting for a rejoin', () => {
    const pair = linkedPair(2);
    let closed = 0;
    pair.host.onClose(() => closed++);
    pair.client.send({ t: 'bye' });
    run(pair, 0.1);
    pair.drop(); // the leaver's connection goes
    expect(pair.host.state).toBe('closed');
    expect(closed).toBe(1);
  });

  it('messages sent while reconnecting wait for the rejoin; stale positions are dropped', async () => {
    const pair = linkedPair(2);
    const got: string[] = [];
    pair.host.onMessage((m) => got.push(m.t));
    pair.drop();
    pair.client.send({ t: 'p', x: 1, y: 1 });
    pair.client.send({ t: 'take', kind: 'core', id: 1 });
    await settleRejoin(pair);
    run(pair, 0.2);
    expect(got).toContain('take');
    expect(got).not.toContain('p');
  });
});

describe('a duel round across a drop (Phase 31)', () => {
  /** Host and client sims on DuelLinks; they freeze while reconnecting, like the scene. */
  function round(lag: number) {
    const pair = linkedPair(lag);
    const host = createDuelSimulation({ seed: DUEL_SEED, role: 'host', hunters: [] });
    const client = createDuelSimulation({ seed: DUEL_SEED, role: 'client', hunters: [] });
    const hostNet = new NetSession(host, pair.host);
    const clientNet = new NetSession(client, pair.client);
    const step = (n = 1, clientInput: Partial<PlayerInput> = {}) => {
      for (let i = 0; i < n; i++) {
        pair.tick(DUEL_DT);
        if (pair.host.state === 'open') {
          hostNet.tick(DUEL_DT);
          host.step(IDLE_INPUT, DUEL_DT);
        }
        if (pair.client.state === 'open') {
          clientNet.tick(DUEL_DT);
          client.step({ ...IDLE_INPUT, ...clientInput }, DUEL_DT);
        }
        pair.pump();
      }
    };
    return { pair, host, client, hostNet, clientNet, step };
  }

  it.each([0, 4, 8])(
    'drop → rejoin → the round goes on with the same state (%i ticks)',
    async (lag) => {
      const { pair, host, client, step } = round(lag);
      const me = client.state.player;
      const [a, b] = host.state.cores;
      teleport(me, a.x, a.y);
      step(40);
      expect(host.state.rival!.cores).toBe(1);
      const before = { time: host.state.time, cores: host.state.cores.map((c) => c.collected) };

      pair.drop();
      step(120); // two seconds of nothing: both frozen
      expect(host.state.time).toBe(before.time);
      await settleRejoin(pair);
      step(40);
      expect(host.state.cores.map((c) => c.collected)).toEqual(before.cores);
      expect(client.state.player.cores).toBe(1);

      // And it can still be won.
      teleport(me, b.x, b.y);
      step(40);
      teleport(me, client.state.beacon.x, client.state.beacon.y);
      step(EXTRACT_TICKS + 2 * lag);
      expect(host.state.duel!.winner).toBe(2);
      expect(client.state.status).toBe('extracted');
    },
  );

  it('a request lost in the drop is asked again after the rejoin', async () => {
    const { pair, host, client, step } = round(4);
    const me = client.state.player;
    const core = host.state.cores[0];
    teleport(me, core.x, core.y);
    pair.tick(DUEL_DT);
    client.step(IDLE_INPUT, DUEL_DT); // asks for the core…
    pair.drop(); // …and the question dies with the connection
    expect(client.state.duel!.pending).toHaveLength(1);
    await settleRejoin(pair);
    step(40);
    expect(host.state.rival!.cores).toBe(1);
    expect(client.state.player.cores).toBe(1);
  });
});

describe('PeerJS setup (Phase 31)', () => {
  it('passes the configured STUN / TURN servers to PeerJS', () => {
    expect(peerOptions()).toEqual({ config: { iceServers: GAME.duel.iceServers } });
  });

  it('tells a relayed connection from a direct one', () => {
    const report = (type: string) => [
      {
        id: 'p1',
        type: 'candidate-pair',
        state: 'succeeded',
        nominated: true,
        localCandidateId: 'l1',
      },
      { id: 'p2', type: 'candidate-pair', state: 'failed', localCandidateId: 'l2' },
      { id: 'l1', type: 'local-candidate', candidateType: type },
      { id: 'l2', type: 'local-candidate', candidateType: 'relay' },
    ];
    expect(usesRelay(report('relay'))).toBe(true);
    expect(usesRelay(report('host'))).toBe(false);
    expect(usesRelay([])).toBe(false);
  });
});
