import { describe, expect, it } from 'vitest';
import { PracticeRival } from '@/bot/practiceRival';
import { DUEL_BOT_ORDER } from '@/config/duelBots';
import { GAME } from '@/config/game';
import { NetSession } from '@/net/netSession';
import { GUEST_ID, PLAYER_ID } from '@/sim/entities/entity';
import { IDLE_INPUT } from '@/sim/playerInput';
import { createDuelSimulation } from '@/sim/simulation';
import { DuelBot } from '@/bot/duelBot';

const DT = 1 / GAME.loop.tickRate;
const LIMIT = 300 / DT;

/** The player's side of a practice duel, as the duel scene runs it. */
function practice(seed: number, level: (typeof DUEL_BOT_ORDER)[number]) {
  const rival = new PracticeRival(seed, level);
  const host = createDuelSimulation({ seed, role: 'host' });
  const net = new NetSession(host, rival.transport);
  const tick = (input = IDLE_INPUT) => {
    net.tick(DT);
    host.step(input, DT);
    rival.step(DT);
  };
  return { rival, host, net, tick };
}

describe('practice vs bot', () => {
  it.each(DUEL_BOT_ORDER)('the %s bot finishes a duel offline, and both sides agree', (level) => {
    const { rival, host, tick } = practice(11, level);
    for (let i = 0; i < LIMIT && host.state.duel!.winner === null; i++) tick();
    // A player who never moves loses to every level.
    expect(host.state.duel!.winner).toBe(GUEST_ID);
    for (let i = 0; i < 30; i++) tick();
    expect(rival.sim.state.duel!.winner).toBe(GUEST_ID);
    expect(rival.sim.state.status).toBe('extracted');
  });

  it('a good player beats the easy bot most of the time', () => {
    let wins = 0;
    for (let seed = 1; seed <= 6; seed++) {
      const { rival, host, tick } = practice(seed, 'easy');
      const me = new DuelBot(host, { level: 'hard' });
      for (let i = 0; i < LIMIT && host.state.duel!.winner === null; i++) tick(me.input());
      for (let i = 0; i < 30; i++) tick();
      expect(rival.sim.state.duel!.winner).toBe(host.state.duel!.winner);
      if (host.state.duel!.winner === PLAYER_ID) wins++;
    }
    expect(wins).toBeGreaterThanOrEqual(4);
  });

  it('leaving closes the link without the bot side looking like a dropped rival mid-round', () => {
    const { rival, net, tick } = practice(5, 'normal');
    let dropped = false;
    net.onDisconnect(() => (dropped = true));
    for (let i = 0; i < 60; i++) tick();
    net.dispose();
    rival.dispose();
    expect(dropped).toBe(false);
  });
});
