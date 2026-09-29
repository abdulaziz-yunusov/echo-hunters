import { describe, expect, it } from 'vitest';
import { StateMachine, type StateTable } from '@/core/fsm';

type Id = 'idle' | 'chase' | 'stunned';
interface Ctx {
  log: string[];
  seesPlayer: boolean;
}

const STATES: StateTable<Ctx, Id> = {
  idle: {
    enter: (c, from) => c.log.push(`enter idle from ${from}`),
    update: (c) => (c.seesPlayer ? 'chase' : undefined),
    exit: (c, to) => c.log.push(`exit idle to ${to}`),
  },
  chase: {
    enter: (c) => c.log.push('enter chase'),
    update: (c) => (c.seesPlayer ? 'chase' : 'idle'),
    exit: (c) => c.log.push('exit chase'),
  },
  stunned: {
    enter: (c) => c.log.push('enter stunned'),
    update: (_c, _dt, time) => (time >= 3 ? 'idle' : undefined),
  },
};

const make = (initial: Id = 'idle') => {
  const ctx: Ctx = { log: [], seesPlayer: false };
  return { ctx, fsm: new StateMachine(STATES, initial, ctx) };
};

describe('StateMachine', () => {
  it('enters the initial state on creation', () => {
    const { ctx, fsm } = make();
    expect(fsm.current).toBe('idle');
    expect(ctx.log).toEqual(['enter idle from null']);
  });

  it('switches when update returns another state, calling exit then enter', () => {
    const { ctx, fsm } = make();
    ctx.seesPlayer = true;
    fsm.update(0.1);
    expect(fsm.current).toBe('chase');
    expect(ctx.log).toEqual(['enter idle from null', 'exit idle to chase', 'enter chase']);
  });

  it('stays (without re-entering) when update returns the current state', () => {
    const { ctx, fsm } = make('chase');
    ctx.seesPlayer = true;
    fsm.update(0.1);
    fsm.update(0.1);
    expect(ctx.log).toEqual(['enter chase']);
    expect(fsm.timeInState).toBeCloseTo(0.2);
  });

  it('tracks time in state and resets it on transition', () => {
    const { fsm } = make('stunned');
    fsm.update(1);
    fsm.update(1);
    expect(fsm.current).toBe('stunned');
    expect(fsm.timeInState).toBe(2);
    fsm.update(1);
    expect(fsm.current).toBe('idle');
    expect(fsm.timeInState).toBe(0);
  });

  it('transition() to the current state restarts it', () => {
    const { ctx, fsm } = make('chase');
    ctx.seesPlayer = true;
    fsm.update(0.5);
    fsm.transition('chase');
    expect(fsm.timeInState).toBe(0);
    expect(ctx.log).toEqual(['enter chase', 'exit chase', 'enter chase']);
  });

  it('is() reports the current state', () => {
    const { fsm } = make();
    expect(fsm.is('idle')).toBe(true);
    expect(fsm.is('chase')).toBe(false);
  });
});
