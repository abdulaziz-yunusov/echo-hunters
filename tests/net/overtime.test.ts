import { afterEach, describe, expect, it } from 'vitest';
import { GAME } from '@/config/game';
import type { GameEvents } from '@/sim/events';
import type { Simulation } from '@/sim/simulation';
import { duel, DUEL_DT, EXTRACT_TICKS, teleport } from '../helpers/duel';

const overtime = GAME.duel.overtime as { at: number };
const REAL_AT = overtime.at;

function collect<K extends keyof GameEvents>(sim: Simulation, type: K): GameEvents[K][] {
  const seen: GameEvents[K][] = [];
  sim.events.on(type, (e) => seen.push(e));
  return seen;
}

describe.each([0, 4, 8])('overtime (Phase 30), %i ticks of lag', (lag) => {
  afterEach(() => {
    overtime.at = REAL_AT;
  });

  it('starts on time on both sides: 1 core wins, cores hum faster, a Stalker at the beacon', () => {
    overtime.at = 3; // the rule, not the wait, is under test
    const { host, client, step } = duel(lag);
    const started = [collect(host, 'overtimeStarted'), collect(client, 'overtimeStarted')];
    const humBefore = host.state.rules.coreHumInterval;
    step({}, {}, Math.round(overtime.at / DUEL_DT) - 2);
    expect(started.flat()).toEqual([]);
    expect(host.state.duel!.coresToWin).toBe(GAME.duel.coresToWin);
    step({}, {}, 3);
    for (const [i, sim] of [host, client].entries()) {
      expect(started[i]).toHaveLength(1);
      expect(started[i][0].time).toBeCloseTo(overtime.at, 1);
      const { duel: d, rules, hunters, beacon } = sim.state;
      expect(d!.coresToWin).toBe(GAME.duel.overtime.coresToWin);
      expect(rules.coreHumInterval).toBeCloseTo(humBefore / GAME.duel.overtime.humSpeedup);
      const extra = hunters.at(-1)!;
      expect(extra).toMatchObject({ type: GAME.duel.overtime.hunter, x: beacon.x, y: beacon.y });
    }
    // The same hunter on both sides, so the host's snapshots move the client's.
    expect(client.state.hunters.map((h) => h.id)).toEqual(host.state.hunters.map((h) => h.id));
    step({}, {}, 60);
    expect(started.flat()).toHaveLength(2); // once each
  });

  it('sudden death: carrying a single core to the beacon wins', () => {
    overtime.at = 3;
    const { host, client, step, settle } = duel(lag);
    const me = client.state.player;
    const core = host.state.cores[0];
    teleport(me, core.x, core.y);
    settle();
    expect(host.state.beacon.active).toBe(false); // one core is not enough yet
    step({}, {}, Math.round(overtime.at / DUEL_DT));
    expect(host.state.beacon.active).toBe(true);
    teleport(me, client.state.beacon.x, client.state.beacon.y);
    step({}, {}, EXTRACT_TICKS + 2 * lag);
    expect(host.state.duel!.winner).toBe(2);
    expect(client.state.status).toBe('extracted');
  });
});
