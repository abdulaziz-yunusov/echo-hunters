import { describe, expect, it } from 'vitest';
import { AUDIO, AUDIO_SOUNDS } from '@/config/audio';
import { HUNTER_TYPES } from '@/config/hunters';
import { SOUND_KINDS } from '@/config/sounds';
import { RevealMap } from '@/render/revealMap';
import type { SoundEmitted } from '@/sim/events';
import { IDLE_INPUT, type PlayerInput } from '@/sim/playerInput';
import { createSimulation } from '@/sim/simulation';
import { simFromAscii, TS } from '../../helpers/maps';

const DT = 1 / 60;
const def = HUNTER_TYPES.mimic;

// The Mimic sits 8 tiles (256 px) right of the player; a wall row below it.
const ROOM = [
  '#################',
  '#...............#',
  '#.P.......H.....#',
  '#########.#######',
  '#...............#',
  '#################',
];

function setup(rows = ROOM) {
  const sim = simFromAscii(rows, { hunters: ['mimic'] });
  const sounds: SoundEmitted[] = [];
  sim.events.on('soundEmitted', (s) => sounds.push(s));
  const run = (input: Partial<PlayerInput>, seconds: number) => {
    for (let i = 0; i < Math.max(1, Math.round(seconds / DT)); i++) {
      sim.step({ ...IDLE_INPUT, ...input }, DT);
    }
  };
  const mimic = () => sim.state.hunters[0];
  /** Put the player `dx`, `dy` px from the Mimic. */
  const placePlayer = (dx: number, dy: number) => {
    const p = sim.state.player;
    p.x = p.prevX = mimic().x + dx;
    p.y = p.prevY = mimic().y + dy;
  };
  return { sim, sounds, run, mimic, placePlayer };
}

describe('Mimic', () => {
  it('its hum is a core’s, but differs in color and pitch', () => {
    const { color, ...hum } = SOUND_KINDS.mimicHum;
    const { color: coreColor, ...core } = SOUND_KINDS.coreHum;
    expect(hum).toEqual(core);
    expect(color).not.toBe(coreColor);
    expect(AUDIO_SOUNDS.mimicHum.synth).not.toBe(AUDIO_SOUNDS.coreHum.synth);
    expect(AUDIO.mimicDetuneCents).toBeGreaterThanOrEqual(20);
  });

  it('hums at its spot, as often as a core', () => {
    const { sim, sounds, run, mimic } = setup();
    run({}, 13);
    const hums = sounds.filter((s) => s.kind === 'mimicHum');
    expect(hums.length).toBeGreaterThanOrEqual(3);
    for (const h of hums) expect(h).toMatchObject({ x: mimic().home.x, y: mimic().home.y });
    for (let i = 1; i < hums.length; i++) {
      expect(hums[i].time - hums[i - 1].time).toBeCloseTo(sim.state.rules.coreHumInterval, 5);
    }
  });

  it('its own hum shows it (as a core’s shows the core); its steps don’t', () => {
    const { sim, mimic } = setup();
    const h = mimic();
    const reveal = new RevealMap(sim.state.walls);
    const object = [{ key: 'm', x: h.x, y: h.y, owner: h.id }];
    sim.emitSound('hunterStep', h.x, h.y, h.id);
    reveal.revealObjects(sim.state.waves, object, 0, DT);
    expect(reveal.objectReveal('m')).toBeUndefined();
    sim.state.waves.length = 0;
    sim.emitSound('mimicHum', h.x, h.y, h.id);
    reveal.revealObjects(sim.state.waves, object, 0, DT);
    expect(reveal.objectReveal('m')).toBeDefined();
  });

  it('answers a ping with a fake ping from its own spot, which no hunter hears', () => {
    const { sounds, run, mimic } = setup();
    run({ ping: true }, 2 * DT);
    run({}, 2);
    const ping = sounds.find((s) => s.kind === 'ping')!;
    const answer = sounds.find((s) => s.kind === 'mimicPing')!;
    expect(answer).toMatchObject({ x: mimic().x, y: mimic().y, owner: mimic().id });
    const heardAt = ping.time + 256 / SOUND_KINDS.ping.speed;
    expect(answer.time).toBeGreaterThanOrEqual(heardAt + def.echoDelay - 2 * DT);
    expect(answer.time).toBeLessThanOrEqual(heardAt + def.echoDelay + 3 * DT);
    const heard: readonly string[] = Object.values(HUNTER_TYPES).flatMap((h) => h.hears);
    expect(SOUND_KINDS.mimicPing.tags.some((t) => heard.includes(t))).toBe(false);
  });

  it('lunges at a player in range and in sight', () => {
    const { run, mimic, placePlayer } = setup();
    placePlayer(-(def.lungeRange - 10), 0);
    run({}, DT);
    expect(mimic().state).toBe('investigate');
  });

  it('does not lunge out of range', () => {
    const { run, mimic, placePlayer } = setup();
    placePlayer(-(def.lungeRange + 20), 0);
    run({}, 1);
    expect(mimic().state).toBe('idle');
    expect(mimic()).toMatchObject(mimic().home);
  });

  it('does not lunge through a wall', () => {
    // The player is under the wall row: 58 px from the Mimic, out of sight.
    const { run, mimic, placePlayer } = setup();
    placePlayer(0, 58);
    run({}, 1);
    expect(mimic().state).toBe('idle');
  });

  it('after a lunge it walks back to its spot and waits there again', () => {
    const { sim, run, mimic, placePlayer } = setup();
    placePlayer(-(def.lungeRange - 10), 0);
    run({}, DT);
    // The player slips away (out of the room's line) while it lunges.
    sim.state.player.x = sim.state.player.prevX = 2.5 * TS;
    run({}, 6);
    expect(mimic().state).toBe('idle');
    expect(Math.hypot(mimic().x - mimic().home.x, mimic().y - mimic().home.y)).toBeLessThan(5);
  });
});

describe('Mimic placement', () => {
  it('takes a coreless room’s center when there is one, and moves no other hunter', () => {
    let coreless = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const alone = createSimulation({ seed, level: 3, hunters: ['stalker', 'listener'] });
      const sim = createSimulation({ seed, level: 3, hunters: ['stalker', 'mimic', 'listener'] });
      const [stalker, mimic, listener] = sim.state.hunters;
      expect(stalker).toMatchObject({ x: alone.state.hunters[0].x, y: alone.state.hunters[0].y });
      expect(listener.x).toBe(sim.state.layout.tiles.center(sim.state.layout.hunterSpawns[2]).x);
      const { rooms, cores, tiles } = sim.state.layout;
      expect(
        cores.some((c) => tiles.center(c).x === mimic.x && tiles.center(c).y === mimic.y),
      ).toBe(false);
      const centers = rooms
        .filter(
          (r) =>
            !cores.some((c) => c.tx >= r.x && c.tx < r.x + r.w && c.ty >= r.y && c.ty < r.y + r.h),
        )
        .map((r) => tiles.center({ tx: r.x + (r.w - 1) / 2, ty: r.y + (r.h - 1) / 2 }));
      if (centers.length > 0) {
        coreless++;
        expect(centers.some((c) => c.x === mimic.x && c.y === mimic.y)).toBe(true);
      }
    }
    expect(coreless).toBeGreaterThan(3);
  });
});
