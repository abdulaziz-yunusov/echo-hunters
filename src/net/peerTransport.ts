import Peer, { type DataConnection, type PeerOptions } from 'peerjs';
import { GAME } from '@/config/game';
import { decode, encode, type NetMessage } from './protocol';
import type { Transport } from './transport';

/** Shown when the PeerJS server or the other player can't be reached (GDD §8). */
export const BLOCKED_MESSAGE =
  'Connection blocked: try disabling your ad blocker, or use a different network.';

/** PeerJS options: the STUN / TURN servers from config (an empty list keeps PeerJS's own). */
export function peerOptions(): PeerOptions {
  const { iceServers } = GAME.duel;
  return iceServers.length > 0 ? { config: { iceServers } } : {};
}

/**
 * Does a WebRTC stats report show the chosen route going through a TURN
 * relay? (The selected candidate pair's local candidate is of type 'relay'.)
 */
export function usesRelay(stats: Iterable<Record<string, unknown>>): boolean {
  const all = [...stats];
  const pair = all.find(
    (s) => s.type === 'candidate-pair' && s.state === 'succeeded' && s.nominated === true,
  );
  if (!pair) return false;
  const local = all.find((s) => s.id === pair.localCandidateId);
  return local?.candidateType === 'relay';
}

/** Wraps an open PeerJS data connection as a Transport. */
class PeerTransport implements Transport {
  private readonly conn: DataConnection;
  /** Frees whatever this connection alone holds (a joiner's own Peer). */
  private readonly release: () => void;
  private closed = false;
  private readonly closeHandlers: (() => void)[] = [];
  private relay = false;

  constructor(conn: DataConnection, release: () => void = () => {}) {
    this.conn = conn;
    this.release = release;
    const lost = () => this.markClosed();
    conn.on('close', lost);
    conn.on('error', lost);
    void this.checkRelay();
  }

  get viaRelay(): boolean {
    return this.relay;
  }

  send(message: NetMessage): void {
    if (!this.closed && this.conn.open) this.conn.send(encode(message));
  }

  onMessage(handler: (message: NetMessage) => void): void {
    this.conn.on('data', (data) => {
      const message = decode(data);
      if (message) handler(message);
    });
  }

  onClose(handler: () => void): void {
    this.closeHandlers.push(handler);
  }

  close(): void {
    this.markClosed();
    this.conn.close();
    this.release();
  }

  private markClosed(): void {
    if (this.closed) return;
    this.closed = true;
    for (const h of this.closeHandlers) h();
  }

  private async checkRelay(): Promise<void> {
    try {
      const report = await this.conn.peerConnection?.getStats();
      if (report) this.relay = usesRelay(report.values() as Iterable<Record<string, unknown>>);
    } catch {
      // No stats: assume a direct connection.
    }
  }
}

export interface HostedRoom {
  /** Room code to give the other player. */
  code: string;
  /** Resolves when someone joins. */
  opponent: Promise<Transport>;
  /**
   * Every later connection to the room (Phase 31): a rival rejoining after
   * a drop. The room stays open until `cancel()`.
   */
  onLaterOpponent(listener: (transport: Transport) => void): void;
  /** Stop waiting and free the room. */
  cancel(): void;
}

/** Open a room and wait for someone to join it. Fails if the PeerJS server can't be reached. */
export async function hostRoom(): Promise<HostedRoom> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const code = randomCode();
    const peer = new Peer(GAME.duel.peerPrefix + code, peerOptions());
    try {
      await opened(peer);
    } catch (error) {
      peer.destroy();
      if ((error as { type?: string }).type === 'unavailable-id') continue; // code taken: try another
      throw new Error(BLOCKED_MESSAGE, { cause: error });
    }
    // Lost the PeerJS server (not the rival): get the same id back, so a rejoin can find us.
    peer.on('disconnected', () => {
      if (!peer.destroyed) peer.reconnect();
    });
    let first = true;
    const later: ((t: Transport) => void)[] = [];
    let cancel = () => peer.destroy();
    const opponent = new Promise<Transport>((resolve, reject) => {
      cancel = () => {
        peer.destroy();
        reject(new Error('cancelled'));
      };
      peer.on('connection', (conn) => {
        conn.on('open', () => {
          const transport = new PeerTransport(conn);
          if (first) {
            first = false;
            resolve(transport);
          } else for (const l of later) l(transport);
        });
      });
      peer.on('error', (e) => {
        if (first) reject(new Error(BLOCKED_MESSAGE, { cause: e }));
      });
    });
    return {
      code,
      opponent,
      onLaterOpponent: (listener) => later.push(listener),
      cancel: () => cancel(),
    };
  }
  throw new Error('Could not get a free room code. Please try again.');
}

/** Join a room by code. Fails after the connect timeout. */
export async function joinRoom(code: string): Promise<Transport> {
  const peer = new Peer(peerOptions());
  try {
    await opened(peer);
    const conn = peer.connect(GAME.duel.peerPrefix + code.toUpperCase(), { reliable: true });
    await withTimeout(
      new Promise<void>((resolve, reject) => {
        conn.on('open', () => resolve());
        conn.on('error', reject);
        peer.on('error', (e) => reject(e));
      }),
    );
    return new PeerTransport(conn, () => peer.destroy());
  } catch (error) {
    peer.destroy();
    const type = (error as { type?: string }).type;
    if (type === 'peer-unavailable') {
      throw new Error(`No room "${code.toUpperCase()}" is open.`, { cause: error });
    }
    throw new Error(BLOCKED_MESSAGE, { cause: error });
  }
}

function opened(peer: Peer): Promise<void> {
  return withTimeout(
    new Promise<void>((resolve, reject) => {
      peer.on('open', () => resolve());
      peer.on('error', reject);
    }),
  );
}

function withTimeout<T>(promise: Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), GAME.duel.connectTimeout * 1000);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

function randomCode(): string {
  const { codeAlphabet, codeLength } = GAME.duel;
  let code = '';
  for (let i = 0; i < codeLength; i++) {
    code += codeAlphabet[Math.floor(Math.random() * codeAlphabet.length)];
  }
  return code;
}
