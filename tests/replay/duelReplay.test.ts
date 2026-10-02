import { describe, expect, it } from 'vitest';
import {
  outcomeFor,
  presentAt,
  replayDuration,
  samplePointAt,
  trackPosition,
  viewedTracks,
  type Replay,
} from '@/replay/replay';
import { toWire } from '@/replay/wire';
import { flushLink, recordedDuel } from '../helpers/duel';

describe('duel recording (Phase 25)', () => {
  it("the host records both players' paths, hits, drops and the winner", () => {
    const { host, client, replay } = recordedDuel();
    const duel = replay.duel!;
    expect(duel.rivalId).toBe(2);
    expect(duel.winner).toBe(2);
    expect(duel.rival.xy.length).toBe(replay.times.length * 2);

    // Where the rival ends up in the recording is where the client really was.
    const end = trackPosition(duel.rival, samplePointAt(replay, replayDuration(replay)));
    expect(end.x).toBeCloseTo(client.state.player.x, 0);
    expect(end.y).toBeCloseTo(client.state.player.y, 0);

    expect(replay.marks.filter((m) => m.kind === 'hit')).toHaveLength(2);
    expect(replay.marks.filter((m) => m.kind === 'core')).toHaveLength(3);
    // The dropped core is there only from the moment it fell.
    const dropped = replay.cores.filter((c) => c.appearedAt !== undefined);
    expect(dropped).toHaveLength(1);
    expect(dropped.map((c) => c.id)).toEqual(
      host.state.cores.filter((c) => c.dropped).map((c) => c.id),
    );
    const at = dropped[0].appearedAt!;
    expect(presentAt(dropped[0], at - 0.1)).toBe(false);
    expect(presentAt(dropped[0], at + 0.1)).toBe(true);
  });

  it('shows each player their own side: whose path is "you" and who won', () => {
    const { replay } = recordedDuel();
    expect(outcomeFor(replay)).toBe('lost'); // the host's view
    expect(outcomeFor(replay, 2)).toBe('extracted');
    expect(viewedTracks(replay)).toEqual({ mine: replay.player, rival: replay.duel!.rival });
    expect(viewedTracks(replay, 2)).toEqual({ mine: replay.duel!.rival, rival: replay.player });
  });

  it('the client receives the same recording after the end', async () => {
    const { hostNet, clientNet, link, replay } = recordedDuel();
    let received: Replay | null = null;
    clientNet.onRecording((r) => (received = r));
    hostNet.shareRecording(replay);
    await flushLink(link);
    expect(received).not.toBeNull();
    const got = received as unknown as Replay;
    // Same picture: the map is the client's own copy, everything else matches.
    expect(toWire(got)).toEqual(toWire(replay));
    expect(got.layout).not.toBe(replay.layout);
    expect(got.sounds.length).toBe(replay.sounds.length);
    expect(got.longestSound).toBeCloseTo(replay.longestSound, 6);
    // Asking again later answers at once.
    let again: Replay | null = null;
    clientNet.onRecording((r) => (again = r));
    expect(again).toBe(got);
  });

  it('the host ignores a recording sent to it', async () => {
    const { hostNet, clientNet, link, replay } = recordedDuel();
    let received = false;
    hostNet.onRecording(() => (received = true));
    clientNet.shareRecording(replay);
    await flushLink(link);
    expect(received).toBe(false);
  });
});
