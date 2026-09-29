/**
 * One state of a state machine. State objects hold no per-instance data:
 * everything lives in the context, so one set of hunter states serves every hunter.
 */
export interface State<Ctx, Id extends string> {
  enter?(ctx: Ctx, from: Id | null): void;
  /** Return another state id to switch to it; return nothing to stay. */
  update?(ctx: Ctx, dt: number, timeInState: number): Id | void;
  exit?(ctx: Ctx, to: Id): void;
}

export type StateTable<Ctx, Id extends string> = Readonly<Record<Id, State<Ctx, Id>>>;

/**
 * Where a machine is, as plain data. Entities carry this themselves so they
 * stay plain data (easy to send over the network, record or copy).
 */
export interface MachineState<Id extends string> {
  state: Id;
  /** Seconds since the current state was entered. */
  stateTime: number;
}

/** Switch now: exit the current state, enter `to`. Switching to the current state restarts it. */
export function enterState<Ctx, Id extends string>(
  table: StateTable<Ctx, Id>,
  host: MachineState<Id>,
  ctx: Ctx,
  to: Id,
): void {
  const from = host.state;
  table[from].exit?.(ctx, to);
  host.state = to;
  host.stateTime = 0;
  table[to].enter?.(ctx, from);
}

/** Run the current state for one step and follow the switch it asks for, if any. */
export function updateState<Ctx, Id extends string>(
  table: StateTable<Ctx, Id>,
  host: MachineState<Id>,
  ctx: Ctx,
  dt: number,
): void {
  host.stateTime += dt;
  const next = table[host.state].update?.(ctx, dt, host.stateTime);
  if (next && next !== host.state) enterState(table, host, ctx, next);
}

/** A self-contained state machine, for things that don't need to be plain data. */
export class StateMachine<Ctx, Id extends string> {
  private readonly table: StateTable<Ctx, Id>;
  private readonly ctx: Ctx;
  private readonly host: MachineState<Id>;

  /** Enters the initial state immediately. */
  constructor(table: StateTable<Ctx, Id>, initial: Id, ctx: Ctx) {
    this.table = table;
    this.ctx = ctx;
    this.host = { state: initial, stateTime: 0 };
    table[initial].enter?.(ctx, null);
  }

  get current(): Id {
    return this.host.state;
  }

  /** Seconds since the current state was entered. */
  get timeInState(): number {
    return this.host.stateTime;
  }

  is(id: Id): boolean {
    return this.host.state === id;
  }

  /** Switch now. Switching to the current state re-enters it (a restart). */
  transition(to: Id): void {
    enterState(this.table, this.host, this.ctx, to);
  }

  update(dt: number): void {
    updateState(this.table, this.host, this.ctx, dt);
  }
}
