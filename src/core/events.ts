type Handler<P> = (payload: P) => void;

/** Events declared with an `undefined` payload are emitted without an argument. */
type EmitArgs<P> = [P] extends [undefined] ? [] : [payload: P];

/**
 * Typed publish/subscribe. The simulation emits what happened
 * (sound emitted, core collected, …); render, audio and network listen.
 *
 * @example
 * interface GameEvents { coreCollected: { id: number }; levelStarted: undefined }
 * const bus = new EventBus<GameEvents>();
 * const off = bus.on('coreCollected', (e) => console.log(e.id));
 * bus.emit('coreCollected', { id: 2 });
 * bus.emit('levelStarted');
 */
export class EventBus<Events extends object> {
  private readonly handlers = new Map<keyof Events, Set<Handler<never>>>();

  /** Subscribe. Returns a function that unsubscribes. */
  on<K extends keyof Events>(type: K, handler: Handler<Events[K]>): () => void {
    let set = this.handlers.get(type);
    if (!set) {
      set = new Set();
      this.handlers.set(type, set);
    }
    set.add(handler);
    return () => this.off(type, handler);
  }

  off<K extends keyof Events>(type: K, handler: Handler<Events[K]>): void {
    this.handlers.get(type)?.delete(handler);
  }

  emit<K extends keyof Events>(type: K, ...args: EmitArgs<Events[K]>): void {
    const set = this.handlers.get(type);
    if (!set || set.size === 0) return;
    const payload = args[0] as Events[K];
    // Copy so handlers may unsubscribe (or subscribe) while being called.
    for (const handler of [...set]) (handler as Handler<Events[K]>)(payload);
  }

  clear(): void {
    this.handlers.clear();
  }
}
