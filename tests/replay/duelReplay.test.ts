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
import { isTool } from '@/config/pickups';
import { GAME } from '@/config/game';
import { SOUND_KINDS } from '@/config/sounds';
import { fromWire } from '@/replay/wire';
import { ReplayRecorder } from '@/replay/recorder';
import { duel, DUEL_SEED, flushLink, recordedDuel, teleport } from '../helpers/duel';

describe('duel recording (Phase 25)', () => {
  it("holds the variant and the overtime, and rebuilds the variant's rings (Phase 30)", () => {
    const overtime = GAME.duel.overtime as { at: number };
    const at = overtime.at;
    overtime.at = 1;
    try {
      const d = duel(2, [], DUEL_SEED, 'echoChamber');
      const recorder = new ReplayRecorder(d.host, DUEL_SEED);
      d.afterHostStep.push(() => recorder.afterStep());
      d.step({ ping: true }, {}, 1);
      d.step({}, {}, 90);
      const replay = recorder.finish();
      expect(replay.duel).toMatchObject({ variant: 'echoChamber' });
      expect(replay.duel!.overtimeAt).toBeCloseTo(1, 1);
      expect(replay.marks.some((m) => m.kind === 'overtime')).toBe(true);
      const { layout, walls } = d.host.state;
      const back = fromWire(toWire(replay), layout, walls);
      expect(back.duel!.variant).toBe('echoChamber');
      expect(back.duel!.overtimeAt).toBeCloseTo(replay.duel!.overtimeAt!, 3);
      const ping = (r: Replay) => r.sounds.find((s) => s.kind === 'ping')!;
      expect(ping(back).maxRadius).toBeCloseTo(ping(replay).maxRadius);
      expect(ping(back).maxRadius).toBeCloseTo(SOUND_KINDS.ping.maxRadius * 1.5);
    } finally {
      overtime.at = at;
    }
  });

  it('a tool swapped out mid-round shows up in the debrief from that moment (Phase 29)', () => {
    const { host, client, settle, afterHostStep } = duel(2);
    const recorder = new ReplayRecorder(host, DUEL_SEED);
    afterHostStep.push(() => recorder.afterStep());
    const [a, b] = host.state.pickups.filter((p) => isTool(p.type));
    for (const t of [a, b]) {
      teleport(client.state.player, t.x, t.y);
      settle();
    }
    const replay = recorder.finish();
    const dropped = replay.pickups.find((p) => p.appearedAt !== undefined)!;
    expect(dropped).toMatchObject({ type: a.type, x: b.x, y: b.y, takenAt: null });
    expect(presentAt(dropped, dropped.appearedAt! - 0.1)).toBe(false);
    expect(presentAt(dropped, dropped.appearedAt! + 0.1)).toBe(true);
  });

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
