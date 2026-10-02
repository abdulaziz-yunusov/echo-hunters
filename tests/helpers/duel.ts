import type { HunterTypeId } from '@/config/hunters';
import { createLoopbackPair } from '@/net/loopback';
import { NetSession } from '@/net/netSession';
import { ReplayRecorder } from '@/replay/recorder';
import type { Player } from '@/sim/entities/player';
import { IDLE_INPUT, type PlayerInput } from '@/sim/playerInput';
import { createDuelSimulation, type Simulation } from '@/sim/simulation';
import { hitPlayer } from '@/sim/systems/duel';

export const DUEL_DT = 1 / 60;
export const DUEL_SEED = 20260929;

/** Host and client simulations joined by an in-memory link with `latency` ticks each way. */
export function duel(latency = 3, hunters: HunterTypeId[] = [], seed = DUEL_SEED) {
  const link = createLoopbackPair(latency);
  const host = createDuelSimulation({ seed, role: 'host', hunters });
  const client = createDuelSimulation({ seed, role: 'client', hunters });
  const hostNet = new NetSession(host, link.a);
  const clientNet = new NetSession(client, link.b);
  /** Called after every host step (e.g. a recorder). */
  const afterHostStep: (() => void)[] = [];
  const step = (
    hostInput: Partial<PlayerInput> = {},
    clientInput: Partial<PlayerInput> = {},
    ticks = 1,
  ) => {
    for (let i = 0; i < ticks; i++) {
      hostNet.tick(DUEL_DT);
      clientNet.tick(DUEL_DT);
      host.step({ ...IDLE_INPUT, ...hostInput }, DUEL_DT);
      client.step({ ...IDLE_INPUT, ...clientInput }, DUEL_DT);
      for (const f of afterHostStep) f();
      link.pump();
    }
  };
  const settle = () => step({}, {}, 40);
  return { host, client, hostNet, clientNet, link, step, settle, afterHostStep };
}

/** Center of the floor tile under (x, y): a safe place to put someone. */
export function floorAt(sim: Simulation, x: number, y: number) {
  const { tiles } = sim.state.layout;
  return tiles.center({ tx: tiles.toTile(x), ty: tiles.toTile(y) });
}

export function teleport(p: Player, x: number, y: number) {
  p.x = p.prevX = x;
  p.y = p.prevY = y;
}

/**
 * A short scripted duel, recorded by the host: the client takes a core, is
 * hit twice and drops it, then takes the other two and extracts (it wins).
 */
export function recordedDuel(latency = 3) {
  const d = duel(latency);
  const recorder = new ReplayRecorder(d.host, DUEL_SEED);
  d.afterHostStep.push(() => recorder.afterStep());
  const { host, client, step, settle } = d;
  const me = client.state.player;
  step({}, { moveX: 1 }, 30);
  const [a, b, c] = host.state.cores;
  teleport(me, a.x, a.y);
  settle();
  const hitRival = () => {
    const rival = host.state.rival!;
    hitPlayer(host, rival, rival.x + 1, rival.y, 100);
  };
  hitRival();
  step({}, {}, 70); // wait out the safety window
  hitRival();
  settle();
  for (const core of [b, c]) {
    teleport(me, core.x, core.y);
    settle();
  }
  teleport(me, client.state.beacon.x, client.state.beacon.y);
  step();
  settle();
  return { ...d, recorder, replay: recorder.finish() };
}

/** Let async work (packing, unpacking a recording) finish while the link keeps delivering. */
export async function flushLink(link: { pump(): void }, rounds = 30): Promise<void> {
  for (let i = 0; i < rounds; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
    link.pump();
  }
}
