import { describe, expect, it } from 'vitest';
import { GUEST_ID } from '@/sim/entities/entity';
import type { SoundEmitted } from '@/sim/events';
import { duel } from '../helpers/duel';

/** Phase 19 hunters in a duel: they run on the host; the client copies them. */
describe('duel with the Phase 19 hunters', () => {
  it('both sides have the same hunters, of the same types, in the same places', () => {
    const { host, client } = duel(3, ['tracker', 'echo', 'mimic']);
    const picture = (s: typeof host) =>
      s.state.hunters.map(({ id, type, x, y }) => ({ id, type, x, y }));
    expect(picture(client)).toEqual(picture(host));
    expect(picture(host).map((h) => h.type)).toEqual(['tracker', 'echo', 'mimic']);
  });

  it('the host’s Tracker gets the guest’s trail; the client keeps none', () => {
    const { host, client, step } = duel(3, ['tracker']);
    step({}, { moveX: 1 }, 60);
    step({}, { moveY: 1 }, 60);
    expect(host.state.trail.some((p) => p.owner === GUEST_ID)).toBe(true);
    expect(client.state.trail).toHaveLength(0);
  });

  it('Tracker and Mimic sounds cross to the client as hunter sounds', () => {
    const { host, client, step } = duel(3, ['tracker', 'mimic']);
    const heard: SoundEmitted[] = [];
    client.events.on('soundEmitted', (s) => heard.push(s));
    const [tracker, mimic] = host.state.hunters;
    host.emitSound('trackerSniff', tracker.x, tracker.y, tracker.id);
    step({}, {}, 60 * 5); // the Mimic hums every 4 s
    expect(heard.find((s) => s.kind === 'trackerSniff')?.owner).toBe(tracker.id);
    expect(heard.find((s) => s.kind === 'mimicHum')).toMatchObject({
      owner: mimic.id,
      x: mimic.home.x,
      y: mimic.home.y,
    });
  });
});
