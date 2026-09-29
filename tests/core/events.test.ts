import { describe, expect, it, vi } from 'vitest';
import { EventBus } from '@/core/events';

interface TestEvents {
  coreCollected: { id: number };
  levelStarted: undefined;
}

describe('EventBus', () => {
  it('delivers payloads to subscribers', () => {
    const bus = new EventBus<TestEvents>();
    const handler = vi.fn();
    bus.on('coreCollected', handler);
    bus.emit('coreCollected', { id: 2 });
    expect(handler).toHaveBeenCalledWith({ id: 2 });
  });

  it('supports events without a payload', () => {
    const bus = new EventBus<TestEvents>();
    const handler = vi.fn();
    bus.on('levelStarted', handler);
    bus.emit('levelStarted');
    expect(handler).toHaveBeenCalledOnce();
  });

  it('unsubscribes with the returned function', () => {
    const bus = new EventBus<TestEvents>();
    const handler = vi.fn();
    const off = bus.on('levelStarted', handler);
    off();
    bus.emit('levelStarted');
    expect(handler).not.toHaveBeenCalled();
  });

  it('lets a handler unsubscribe itself during emit without skipping others', () => {
    const bus = new EventBus<TestEvents>();
    const second = vi.fn();
    const off = bus.on('levelStarted', () => off());
    bus.on('levelStarted', second);
    bus.emit('levelStarted');
    bus.emit('levelStarted');
    expect(second).toHaveBeenCalledTimes(2);
  });

  it('clear() removes every handler', () => {
    const bus = new EventBus<TestEvents>();
    const handler = vi.fn();
    bus.on('coreCollected', handler);
    bus.clear();
    bus.emit('coreCollected', { id: 1 });
    expect(handler).not.toHaveBeenCalled();
  });
});
