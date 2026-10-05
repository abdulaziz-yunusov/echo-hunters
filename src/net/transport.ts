import type { NetMessage } from './protocol';

/**
 * A two-way message pipe to the other player. PeerJS in the browser
 * (peerTransport.ts); an in-memory pair in tests (loopback.ts).
 */
export interface Transport {
  send(message: NetMessage): void;
  /** Called for every valid message received. */
  onMessage(handler: (message: NetMessage) => void): void;
  /** Called once when the connection drops (or the other side leaves). */
  onClose(handler: () => void): void;
  close(): void;
  /** PeerJS: the connection goes through a TURN relay (Phase 31). */
  readonly viaRelay?: boolean;
  /** DuelLink: the dropped connection came back (Phase 31). */
  onResume?(handler: () => void): void;
  /** DuelLink: this side's tab is hidden. */
  readonly away?: boolean;
}
