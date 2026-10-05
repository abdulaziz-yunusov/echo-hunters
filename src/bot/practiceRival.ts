import type { DuelBotId } from '@/config/duelBots';
import { GAME } from '@/config/game';
import { deriveSeed } from '@/core/rng';
import { createLoopbackPair } from '@/net/loopback';
import { NetSession } from '@/net/netSession';
import type { Transport } from '@/net/transport';
import { createDuelSimulation, type Simulation } from '@/sim/simulation';
import { DuelBot } from './duelBot';

/**
 * The rival of a practice duel (Phase 26): a duel bot playing the client's
 * side on its own simulation, joined to the player's (the host's) over the
 * in-memory loopback. The player's side runs exactly as in an online duel,
 * so practice also exercises the netcode. No PeerJS, works offline.
 */
export class PracticeRival {
  /** The player's end of the link: hand it to the host's NetSession. */
  readonly transport: Transport;
  readonly sim: Simulation;
  private readonly link: ReturnType<typeof createLoopbackPair>;
  private readonly net: NetSession;
  private readonly bot: DuelBot;

  constructor(seed: number, level: DuelBotId) {
    this.link = createLoopbackPair(GAME.duel.practiceLagTicks);
    this.transport = this.link.a;
    this.sim = createDuelSimulation({ seed, role: 'client' });
    this.net = new NetSession(this.sim, this.link.b);
    this.bot = new DuelBot(this.sim, { level, seed: deriveSeed(seed, 'practice-bot') });
  }

  /** One tick of the rival, after the player's side has stepped; then deliver messages. */
  step(dt: number): void {
    this.net.tick(dt);
    this.sim.step(this.bot.input(), dt);
    this.link.pump();
  }

  dispose(): void {
    this.bot.dispose();
    this.net.dispose();
  }
}
