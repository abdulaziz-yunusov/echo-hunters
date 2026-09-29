import { decode, encode, type NetMessage } from './protocol';
import type { Transport } from './transport';

interface Pending {
  due: number;
  message: string;
}

/**
 * Two connected in-memory transports, with a delay of `latencyTicks` pumps
 * each way. Messages go through encode/decode like the real thing. Call
 * `pump()` once per simulation tick to deliver what is due.
 */
export function createLoopbackPair(latencyTicks = 0) {
  let now = 0;
  const inbox: [Pending[], Pending[]] = [[], []];
  const handlers: [((m: NetMessage) => void)[], ((m: NetMessage) => void)[]] = [[], []];
  const closeHandlers: [(() => void)[], (() => void)[]] = [[], []];
  let open = true;

  const end = (side: 0 | 1): Transport => ({
    send(message) {
      if (open) inbox[1 - side].push({ due: now + latencyTicks, message: encode(message) });
    },
    onMessage(handler) {
      handlers[side].push(handler);
    },
    onClose(handler) {
      closeHandlers[side].push(handler);
    },
    close() {
      if (!open) return;
      open = false;
      for (const h of closeHandlers[1 - side]) h();
    },
  });

  return {
    a: end(0),
    b: end(1),
    /** Advance one tick and deliver due messages, in order. */
    pump() {
      now++;
      for (const side of [0, 1] as const) {
        const due = inbox[side].filter((p) => p.due <= now);
        inbox[side] = inbox[side].filter((p) => p.due > now);
        for (const p of due) {
          const message = decode(p.message);
          if (message) for (const h of handlers[side]) h(message);
        }
      }
    },
  };
}
