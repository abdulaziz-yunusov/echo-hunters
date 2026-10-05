import { EMITTER_TYPES } from '@/config/emitters';
import { HUNTER_TYPES, type HunterTypeId } from '@/config/hunters';
import { PICKUP_TYPES } from '@/config/pickups';
import { REPLAY } from '@/config/replay';
import { SOUND_KINDS, type SoundKindId } from '@/config/sounds';
import { createWave } from '@/sim/sound/soundWave';
import type { WallGeometry } from '@/sim/world/edges';
import type { MapLayout } from '@/sim/world/mapGen';
import type {
  DuelEvent,
  Replay,
  ReplayEmitter,
  ReplayMarkKind,
  ReplayPickup,
  ReplayThing,
  ReplayTrack,
} from './replay';

/*
 * A recording as it travels to the other duel player. The map, the walls
 * and the rings' polygons are left out: the receiver has the same map from
 * the shared seed and rebuilds them. Positions are rounded to 0.1 px and
 * sample times to 1 ms, stored as differences (small numbers), then gzipped.
 */

const WIRE_VERSION = 2;
/** Tenths of a pixel; milliseconds. */
const POS = 10;
const MS = 1000;

interface WireTrack {
  xy: number[];
  codes: number[];
}

/** id, kind, x, y, owner (-1 = the world), start time, aim, focus x, focus y. */
type WireSound = [number, SoundKindId, number, number, number, number, number, number, number];

/** kind, time, x, y. */
type WireMark = [ReplayMarkKind, number, number, number];

export interface WireReplay {
  v: number;
  level: number;
  seed: number;
  playerId: number;
  times: number[];
  player: WireTrack;
  hunters: { id: number; type: HunterTypeId; track: WireTrack }[];
  sounds: WireSound[];
  marks: WireMark[];
  cores: ReplayThing[];
  pickups: ReplayPickup[];
  emitters: ReplayEmitter[];
  beacon: Replay['beacon'];
  outcome: Replay['outcome'];
  duel: {
    rivalId: number;
    rival: WireTrack;
    winner: number | null;
    events: DuelEvent[];
  } | null;
}

export function toWire(r: Replay): WireReplay {
  return {
    v: WIRE_VERSION,
    level: r.level,
    seed: r.seed,
    playerId: r.playerId,
    times: deltas(r.times, MS, 1),
    player: packTrack(r.player),
    hunters: r.hunters.map((h) => ({ id: h.id, type: h.type, track: packTrack(h.track) })),
    sounds: r.sounds.map((w) => [
      w.id,
      w.kind,
      round(w.x, 100),
      round(w.y, 100),
      w.owner ?? -1,
      round(w.startTime, 10000),
      round(w.arc?.dir ?? 0, 10000),
      round(w.focusX, 100),
      round(w.focusY, 100),
    ]),
    marks: r.marks.map((m) => [m.kind, round(m.time, MS), round(m.x, POS), round(m.y, POS)]),
    cores: r.cores,
    pickups: r.pickups,
    emitters: r.emitters,
    beacon: r.beacon,
    outcome: r.outcome,
    duel: r.duel && {
      rivalId: r.duel.rivalId,
      rival: packTrack(r.duel.rival),
      winner: r.duel.winner,
      events: r.duel.events.map((e) => ({ ...e, time: round(e.time, MS) })),
    },
  };
}

/** Rebuild a recording on the receiver's own copy of the map. */
export function fromWire(w: WireReplay, layout: MapLayout, walls: WallGeometry): Replay {
  const sounds = w.sounds.map(([id, kind, x, y, owner, start, dir, fx, fy]) =>
    createWave(walls, id, kind, x, y, owner < 0 ? null : owner, start, {
      focus: { x: fx, y: fy },
      dir,
    }),
  );
  return {
    level: w.level,
    seed: w.seed,
    layout,
    walls,
    playerId: w.playerId,
    times: undeltas(w.times, MS, 1),
    player: unpackTrack(w.player),
    hunters: w.hunters.map((h) => ({ id: h.id, type: h.type, track: unpackTrack(h.track) })),
    sounds,
    longestSound: sounds.reduce((m, s) => Math.max(m, s.maxRadius / s.speed), 0),
    marks: w.marks.map(([kind, time, x, y]) => ({ kind, time, x, y })),
    cores: w.cores,
    pickups: w.pickups,
    emitters: w.emitters,
    beacon: w.beacon,
    outcome: w.outcome,
    duel: w.duel && {
      rivalId: w.duel.rivalId,
      rival: unpackTrack(w.duel.rival),
      winner: w.duel.winner,
      events: w.duel.events,
    },
  };
}

/** The recording as one gzipped, base64 string (for the `rec` message). */
export async function packReplay(replay: Replay): Promise<string> {
  const json = JSON.stringify(toWire(replay));
  const zipped = new Blob([json]).stream().pipeThrough(new CompressionStream('gzip'));
  return toBase64(new Uint8Array(await new Response(zipped).arrayBuffer()));
}

/** Undo packReplay on this side's map. Anything malformed or too big gives null. */
export async function unpackReplay(
  data: string,
  layout: MapLayout,
  walls: WallGeometry,
): Promise<Replay | null> {
  try {
    const bytes = fromBase64(data);
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
    const wire: unknown = JSON.parse(await readCapped(stream, REPLAY.maxUnpackedBytes));
    if (!isWireReplay(wire)) return null;
    return fromWire(wire, layout, walls);
  } catch {
    return null;
  }
}

// ─── Encoding helpers ────────────────────────────────────────────────────────

function round(v: number, scale: number): number {
  return Math.round(v * scale) / scale;
}

/** Scaled to integers, each stored as the difference from the previous one `stride` back. */
function deltas(values: readonly number[], scale: number, stride: number): number[] {
  return values.map((v, i) => {
    const prev = i >= stride ? Math.round(values[i - stride] * scale) : 0;
    return Math.round(v * scale) - prev;
  });
}

function undeltas(diffs: readonly number[], scale: number, stride: number): number[] {
  const ints: number[] = [];
  for (let i = 0; i < diffs.length; i++) ints.push(diffs[i] + (i >= stride ? ints[i - stride] : 0));
  return ints.map((v) => v / scale);
}

function packTrack(t: ReplayTrack): WireTrack {
  return { xy: deltas(t.xy, POS, 2), codes: t.codes };
}

function unpackTrack(t: WireTrack): ReplayTrack {
  return { xy: undeltas(t.xy, POS, 2), codes: t.codes };
}

function toBase64(bytes: Uint8Array): string {
  let text = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    text += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(text);
}

function fromBase64(text: string): Uint8Array<ArrayBuffer> {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Read a byte stream as text, giving up past `limit` bytes (a tiny gzip can unpack to gigabytes). */
async function readCapped(stream: ReadableStream<Uint8Array>, limit: number): Promise<string> {
  const reader = stream.getReader();
  const parts: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > limit) {
      await reader.cancel();
      throw new Error('recording too large');
    }
    parts.push(value);
  }
  const all = new Uint8Array(total);
  let at = 0;
  for (const p of parts) {
    all.set(p, at);
    at += p.length;
  }
  return new TextDecoder().decode(all);
}

// ─── Checking what came in ───────────────────────────────────────────────────

type Rec = Record<string, unknown>;
const MARK_KINDS: Record<ReplayMarkKind, true> = {
  core: true,
  pickup: true,
  beacon: true,
  hit: true,
  stun: true,
  close: true,
  end: true,
};
const OUTCOMES = [null, 'extracted', 'dead', 'lost'];

const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const int = (v: unknown): v is number => Number.isInteger(v);
const obj = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v);
const list = <T>(v: unknown, each: (x: unknown) => boolean): v is T[] =>
  Array.isArray(v) && v.every(each);
const time = (v: unknown) => v === null || num(v);
const thing = (v: unknown): v is Rec =>
  obj(v) &&
  int(v.id) &&
  num(v.x) &&
  num(v.y) &&
  time(v.takenAt) &&
  (v.appearedAt === undefined || num(v.appearedAt));
const track = (v: unknown, samples: number) =>
  obj(v) &&
  list(v.xy, int) &&
  list(v.codes, int) &&
  v.xy.length === samples * 2 &&
  v.codes.length === samples;
const sound = (v: unknown) =>
  Array.isArray(v) &&
  v.length === 9 &&
  int(v[0]) &&
  typeof v[1] === 'string' &&
  v[1] in SOUND_KINDS &&
  v.slice(2).every(num) &&
  int(v[4]);
const duelEvent = (v: unknown) =>
  obj(v) &&
  num(v.time) &&
  int(v.by) &&
  ((v.kind === 'core' && (v.from === null || int(v.from))) ||
    (v.kind === 'hit' && int(v.target)) ||
    v.kind === 'drop');
const mark = (v: unknown) =>
  Array.isArray(v) &&
  v.length === 4 &&
  typeof v[0] === 'string' &&
  v[0] in MARK_KINDS &&
  v.slice(1).every(num);

function isWireReplay(w: unknown): w is WireReplay {
  if (!obj(w) || w.v !== WIRE_VERSION || !int(w.level) || !num(w.seed) || !int(w.playerId)) {
    return false;
  }
  if (!list<number>(w.times, int)) return false;
  const n = w.times.length;
  const duel = w.duel;
  return (
    track(w.player, n) &&
    list(
      w.hunters,
      (h) => obj(h) && int(h.id) && String(h.type) in HUNTER_TYPES && track(h.track, n),
    ) &&
    list(w.sounds, sound) &&
    list(w.marks, mark) &&
    list(w.cores, thing) &&
    list(w.pickups, (p) => thing(p) && String(p.type) in PICKUP_TYPES) &&
    list(
      w.emitters,
      (e) =>
        obj(e) &&
        int(e.id) &&
        String(e.type) in EMITTER_TYPES &&
        num(e.x) &&
        num(e.y) &&
        list(e.spells, num),
    ) &&
    obj(w.beacon) &&
    num(w.beacon.x) &&
    num(w.beacon.y) &&
    time(w.beacon.activeAt) &&
    OUTCOMES.includes(w.outcome as string | null) &&
    (duel === null ||
      (obj(duel) &&
        int(duel.rivalId) &&
        track(duel.rival, n) &&
        (duel.winner === null || int(duel.winner)) &&
        list(duel.events, duelEvent)))
  );
}
