/**
 * One state of a StateMachine. State objects hold no per-instance data:
 * everything lives in the context, so one set of hunter states serves every hunter.
 */
export interface State<Ctx, Id extends string> {
  enter?(ctx: Ctx, from: Id | null): void;
  /** Return another state id to switch to it; return nothing to stay. */
  update?(ctx: Ctx, dt: number, timeInState: number): Id | void;
  exit?(ctx: Ctx, to: Id): void;
}

export type StateTable<Ctx, Id extends string> = Readonly<Record<Id, State<Ctx, Id>>>;

/** Minimal finite state machine (hunter AI and other small behaviours). */
export class StateMachine<Ctx, Id extends string> {
  private readonly states: StateTable<Ctx, Id>;
  private readonly ctx: Ctx;
  private currentId: Id;
  private elapsed = 0;

  /** Enters the initial state immediately. */
  constructor(states: StateTable<Ctx, Id>, initial: Id, ctx: Ctx) {
    this.states = states;
    this.ctx = ctx;
    this.currentId = initial;
    this.states[initial].enter?.(ctx, null);
  }

  get current(): Id {
    return this.currentId;
  }

  /** Seconds since the current state was entered. */
  get timeInState(): number {
    return this.elapsed;
  }

  is(id: Id): boolean {
    return this.currentId === id;
  }

  /** Switch now. Switching to the current state re-enters it (a restart). */
  transition(to: Id): void {
    const from = this.currentId;
    this.states[from].exit?.(this.ctx, to);
    this.currentId = to;
    this.elapsed = 0;
    this.states[to].enter?.(this.ctx, from);
  }

  update(dt: number): void {
    this.elapsed += dt;
    const next = this.states[this.currentId].update?.(this.ctx, dt, this.elapsed);
    if (next && next !== this.currentId) this.transition(next);
  }
}
