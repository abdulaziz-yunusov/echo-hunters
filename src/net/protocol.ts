import { REPLAY } from '@/config/replay';
import { SOUND_KINDS, type SoundKindId } from '@/config/sounds';
import type { TakeKind } from '@/sim/gameState';

/** Bump when messages change shape; mismatched players are told to reload. */
export const PROTOCOL_VERSION = 3;

export type { TakeKind };

export interface HunterSnap {
  id: number;
  x: number;
  y: number;
  state: string;
}

export interface CoreSnap {
  id: number;
  x: number;
  y: number;
  collected: boolean;
}

/**
 * Everything the two players say to each other (GDD §8 netcode). The host
 * is the referee for anything contested; each player owns its own movement.
 */
export type NetMessage =
  /** Host → client, once connected: the shared map seed. */
  | { t: 'hello'; v: number; seed: number }
  /** Own position (15 Hz). */
  | { t: 'p'; x: number; y: number }
  /** A sound made by the sender (or, from the host, by a hunter); `dir` aims a beam. */
  | {
      t: 'snd';
      kind: SoundKindId;
      x: number;
      y: number;
      owner: number;
      fx: number;
      fy: number;
      dir?: number;
    }
  /** Client → host: "I am touching this, may I take it?" */
  | { t: 'take'; kind: TakeKind; id: number }
  /** Host → client: someone got it. */
  | { t: 'taken'; kind: TakeKind; id: number; by: number }
  /** Host → client: too late, it's gone. */
  | { t: 'denied'; kind: TakeKind; id: number }
  /** Client → host: "I'm at the beacon with enough cores." */
  | { t: 'extract' }
  /** Host → client: you were hit (now `hits` hits). */
  | { t: 'hit'; hits: number; fromX: number; fromY: number }
  /** Host → client: a player dropped their cores here. */
  | { t: 'drop'; by: number; cores: CoreSnap[] }
  /** Host → client: the authoritative picture (10 Hz). */
  | {
      t: 'snap';
      hunters: HunterSnap[];
      cores: CoreSnap[];
      held: [number, number][];
      hits: [number, number][];
      beacon: boolean;
      winner: number | null;
    }
  /** Host → client: the duel is over. */
  | { t: 'end'; winner: number }
  /** Host → client, after the end: the round's recording for the debrief (replay/wire.ts). */
  | { t: 'rec'; data: string }
  /** Leaving on purpose. */
  | { t: 'bye' };

export type MessageType = NetMessage['t'];

export function encode(message: NetMessage): string {
  return JSON.stringify(message);
}

/** Parse and check a message. Anything malformed or unknown gives null (and is ignored). */
export function decode(data: unknown): NetMessage | null {
  let m: unknown = data;
  if (typeof data === 'string') {
    try {
      m = JSON.parse(data);
    } catch {
      return null;
    }
  }
  if (typeof m !== 'object' || m === null) return null;
  const check = VALIDATORS[(m as { t?: unknown }).t as MessageType];
  return check && check(m as Record<string, unknown>) ? (m as NetMessage) : null;
}

type Rec = Record<string, unknown>;
const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const int = (v: unknown): v is number => Number.isInteger(v);
const takeKind = (v: unknown): v is TakeKind => v === 'core' || v === 'pickup';
const pairs = (v: unknown) =>
  Array.isArray(v) && v.every((p) => Array.isArray(p) && p.length === 2 && p.every(num));
const cores = (v: unknown) =>
  Array.isArray(v) &&
  v.every((c: Rec) => c && int(c.id) && num(c.x) && num(c.y) && typeof c.collected === 'boolean');

const VALIDATORS: Record<MessageType, (m: Rec) => boolean> = {
  hello: (m) => int(m.v) && num(m.seed),
  p: (m) => num(m.x) && num(m.y),
  snd: (m) =>
    typeof m.kind === 'string' &&
    m.kind in SOUND_KINDS &&
    num(m.x) &&
    num(m.y) &&
    int(m.owner) &&
    num(m.fx) &&
    num(m.fy) &&
    (m.dir === undefined || num(m.dir)),
  take: (m) => takeKind(m.kind) && int(m.id),
  taken: (m) => takeKind(m.kind) && int(m.id) && int(m.by),
  denied: (m) => takeKind(m.kind) && int(m.id),
  extract: () => true,
  hit: (m) => int(m.hits) && num(m.fromX) && num(m.fromY),
  drop: (m) => int(m.by) && cores(m.cores),
  snap: (m) =>
    Array.isArray(m.hunters) &&
    m.hunters.every(
      (h: Rec) => h && int(h.id) && num(h.x) && num(h.y) && typeof h.state === 'string',
    ) &&
    cores(m.cores) &&
    pairs(m.held) &&
    pairs(m.hits) &&
    typeof m.beacon === 'boolean' &&
    (m.winner === null || int(m.winner)),
  end: (m) => int(m.winner),
  rec: (m) => typeof m.data === 'string' && m.data.length <= REPLAY.maxPackedChars,
  bye: () => true,
};
