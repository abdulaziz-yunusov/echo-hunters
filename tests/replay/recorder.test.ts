import { describe, expect, it } from 'vitest';
import { REPLAY } from '@/config/replay';
import { ReplayRecorder } from '@/replay/recorder';
import { presentAt, replayDuration, samplePointAt, soundsAt, trackPosition } from '@/replay/replay';
import { IDLE_INPUT, type PlayerInput } from '@/sim/playerInput';
import { simFromAscii } from '../helpers/maps';

const DT = 1 / 60;

// One core between the player and the beacon.
const LINE = ['#############', '#P...C.....B#', '#############'];

function setup(rows = LINE) {
  const sim = simFromAscii(rows, { hunters: [] });
  const recorder = new ReplayRecorder(sim, 42);
  const run = (input: Partial<PlayerInput>, seconds: number) => {
    for (let i = 0; i < Math.round(seconds / DT); i++) {
      sim.step({ ...IDLE_INPUT, ...input }, DT);
      recorder.afterStep();
    }
  };
  return { sim, recorder, run };
}

describe('ReplayRecorder', () => {
  it(`samples positions ${REPLAY.sampleHz} times a second, from the first tick`, () => {
    const { recorder, run } = setup();
    run({}, 1);
    const replay = recorder.finish();
    expect(replay.times.length).toBe(REPLAY.sampleHz + 1);
    expect(replay.times[0]).toBe(0);
    expect(replayDuration(replay)).toBeCloseTo(1, 5);
    expect(replay.player.xy.length).toBe(replay.times.length * 2);
  });

  it('keeps the exact sampled positions and glides between them', () => {
    const { sim, recorder, run } = setup();
    run({ moveX: 1 }, 0.5);
    const atHalf = { x: sim.state.player.x, y: sim.state.player.y };
    const replay = recorder.finish();
    const end = trackPosition(replay.player, samplePointAt(replay, 0.5));
    expect(end.x).toBeCloseTo(atHalf.x, 3);
    expect(end.y).toBeCloseTo(atHalf.y, 3);

    // Halfway between two samples lies halfway between their positions.
    const a = trackPosition(replay.player, samplePointAt(replay, replay.times[3]));
    const b = trackPosition(replay.player, samplePointAt(replay, replay.times[4]));
    const mid = trackPosition(
      replay.player,
      samplePointAt(replay, (replay.times[3] + replay.times[4]) / 2),
    );
    expect(mid.x).toBeCloseTo((a.x + b.x) / 2, 5);
  });

  it('clamps queries before the start and after the end', () => {
    const { recorder, run } = setup();
    run({ moveX: 1 }, 0.5);
    const replay = recorder.finish();
    expect(samplePointAt(replay, -3)).toEqual({ i: 0, f: 0 });
    expect(samplePointAt(replay, 99)).toEqual({ i: replay.times.length - 1, f: 0 });
  });

  it('records sounds, and sizes rings for any moment without touching the recording', () => {
    const { recorder, run } = setup();
    run({ ping: true }, DT);
    run({}, 0.2);
    const replay = recorder.finish();
    const ping = replay.sounds.find((s) => s.kind === 'ping');
    expect(ping).toBeDefined();
    if (!ping) return;

    const t = ping.startTime + 0.5;
    const ring = soundsAt(replay, t).find((s) => s.id === ping.id);
    expect(ring?.radius).toBeCloseTo(ping.speed * 0.5, 5);
    // Before it starts and after it is full size, it is not there.
    expect(soundsAt(replay, ping.startTime - 0.1).some((s) => s.id === ping.id)).toBe(false);
    const full = ping.startTime + ping.maxRadius / ping.speed + 0.01;
    expect(soundsAt(replay, full).some((s) => s.id === ping.id)).toBe(false);
    expect(replay.longestSound).toBeGreaterThanOrEqual(ping.maxRadius / ping.speed);
  });

  it('marks when cores are taken, the beacon wakes and the round ends', () => {
    const { recorder, run } = setup();
    run({ moveX: 1 }, 4);
    const replay = recorder.finish();
    const kinds = replay.marks.map((m) => m.kind);
    expect(kinds).toEqual(['core', 'beacon', 'end']);
    expect(replay.outcome).toBe('extracted');

    const core = replay.cores[0];
    expect(core.takenAt).not.toBeNull();
    expect(presentAt(core, (core.takenAt ?? 0) - 0.01)).toBe(true);
    expect(presentAt(core, core.takenAt ?? 0)).toBe(false);
    expect(replay.beacon.activeAt).toBe(core.takenAt);
  });

  it('records hunter tracks with their AI state', () => {
    const sim = simFromAscii(['#########', '#P.....H#', '#########'], { hunters: ['stalker'] });
    const recorder = new ReplayRecorder(sim, 1);
    for (let i = 0; i < 30; i++) {
      sim.step(IDLE_INPUT, DT);
      recorder.afterStep();
    }
    const replay = recorder.finish();
    expect(replay.hunters).toHaveLength(1);
    expect(replay.hunters[0].type).toBe('stalker');
    expect(replay.hunters[0].track.codes.length).toBe(replay.times.length);
  });

  it('stops listening once finished', () => {
    const { sim, recorder, run } = setup();
    run({}, 0.1);
    const replay = recorder.finish();
    const sounds = replay.sounds.length;
    const samples = replay.times.length;
    run({ ping: true }, 0.5);
    expect(replay.sounds.length).toBe(sounds);
    expect(replay.times.length).toBe(samples);
    expect(sim.state.player.pingsUsed).toBe(1);
  });

  it(`stops sampling after ${REPLAY.maxSeconds / 60} minutes`, () => {
    const { sim, recorder, run } = setup();
    run({}, 0.1);
    const samples = (recorder as unknown as { replay: { times: number[] } }).replay.times;
    const before = samples.length;
    sim.state.time = REPLAY.maxSeconds + 1;
    run({ ping: true }, 0.5);
    const replay = recorder.finish();
    expect(replay.times.length).toBe(before);
    expect(replay.sounds.some((s) => s.kind === 'ping')).toBe(false);
  });
});
