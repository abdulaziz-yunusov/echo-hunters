import { describe, expect, it } from 'vitest';
import { REPLAY } from '@/config/replay';
import { ReplayRecorder } from '@/replay/recorder';
import { fromWire, packReplay, toWire, unpackReplay } from '@/replay/wire';
import { IDLE_INPUT } from '@/sim/playerInput';
import { createSimulation } from '@/sim/simulation';

const DT = 1 / 60;

/** 4 s of a real level 3 round: walking, a beam, then a ping. */
function recorded() {
  const sim = createSimulation({ seed: 4, level: 3 });
  const recorder = new ReplayRecorder(sim, 4);
  for (let i = 0; i < 240; i++) {
    const aim = { x: sim.state.player.x + 50, y: sim.state.player.y - 30 };
    sim.step(
      {
        ...IDLE_INPUT,
        moveX: 1,
        moveY: 0.3,
        ping: i === 5 || i === 200,
        pingHeld: i >= 5 && i < 40,
        aim,
      },
      DT,
    );
    recorder.afterStep();
  }
  return { sim, replay: recorder.finish() };
}

async function gzipBase64(text: string): Promise<string> {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
  const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

describe('replay wire format', () => {
  it('rebuilds a recording on the same map, to within rounding', async () => {
    const { sim, replay } = recorded();
    const back = await unpackReplay(await packReplay(replay), sim.state.layout, sim.state.walls);
    expect(back).not.toBeNull();
    if (!back) return;
    expect(back.times).toHaveLength(replay.times.length);
    back.times.forEach((t, i) => expect(t).toBeCloseTo(replay.times[i], 3));
    back.player.xy.forEach((v, i) => expect(Math.abs(v - replay.player.xy[i])).toBeLessThan(0.051));
    expect(back.player.codes).toEqual(replay.player.codes);
    expect(back.hunters.map((h) => h.track.codes)).toEqual(
      replay.hunters.map((h) => h.track.codes),
    );
    expect(back.marks.map((m) => m.kind)).toEqual(replay.marks.map((m) => m.kind));
    expect(back.sounds.map((s) => [s.id, s.kind, s.owner])).toEqual(
      replay.sounds.map((s) => [s.id, s.kind, s.owner]),
    );
    // Rings are rebuilt, beams aimed the same way.
    const beam = replay.sounds.find((s) => s.kind === 'pingBeam');
    expect(beam).toBeDefined();
    const beamBack = back.sounds.find((s) => s.id === beam!.id)!;
    expect(beamBack.arc!.dir).toBeCloseTo(beam!.arc!.dir, 3);
    expect(beamBack.polygon.length).toBeGreaterThan(0);
    expect(back.outcome).toBe(replay.outcome);
    expect(back.duel).toBeNull();
  });

  it('is much smaller than the recording itself', async () => {
    const { replay } = recorded();
    const packed = await packReplay(replay);
    expect(packed.length).toBeLessThan(JSON.stringify(toWire(replay)).length / 3);
  });

  it('round trips exactly once rounded (both sides see the same debrief)', () => {
    const { sim, replay } = recorded();
    const once = toWire(replay);
    const twice = toWire(fromWire(once, sim.state.layout, sim.state.walls));
    expect(twice).toEqual(once);
  });

  it('turns anything malformed into null', async () => {
    const { sim, replay } = recorded();
    const { layout, walls } = sim.state;
    const unpack = (data: string) => unpackReplay(data, layout, walls);
    expect(await unpack('not base64 at all!')).toBeNull();
    expect(await unpack(btoa('not gzip'))).toBeNull();
    expect(await unpack(await gzipBase64('{"v":1}'))).toBeNull();
    expect(await unpack(await gzipBase64('[1, 2'))).toBeNull();

    const wire = toWire(replay);
    const broken = [
      { ...wire, times: wire.times.slice(1) }, // tracks no longer match the samples
      { ...wire, sounds: [[1, 'meow', 0, 0, -1, 0, 0, 0, 0]] },
      { ...wire, marks: [['party', 0, 0, 0]] },
      { ...wire, hunters: [{ id: 100, type: 'ghost', track: wire.player }] },
      { ...wire, outcome: 'won' },
      { ...wire, v: 99 },
      // Duel events (Phase 27): unknown kinds and missing players are refused.
      ...[
        { kind: 'dance', time: 1, by: 1 },
        { kind: 'hit', time: 1, by: 1 },
      ].map((event) => ({
        ...wire,
        duel: { rivalId: 2, rival: wire.player, winner: null, events: [event] },
      })),
    ];
    for (const w of broken) expect(await unpack(await gzipBase64(JSON.stringify(w)))).toBeNull();
  });

  it('refuses a small message that unpacks to something huge', async () => {
    const { sim } = recorded();
    const bomb = await gzipBase64(' '.repeat(REPLAY.maxUnpackedBytes + 1));
    expect(bomb.length).toBeLessThan(REPLAY.maxPackedChars);
    expect(await unpackReplay(bomb, sim.state.layout, sim.state.walls)).toBeNull();
  });
});
