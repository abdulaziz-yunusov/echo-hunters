import { describe, expect, it } from 'vitest';
import { GAME } from '@/config/game';
import { PICKUP_TYPES, type PickupTypeId } from '@/config/pickups';
import type { SoundEmitted } from '@/sim/events';
import { IDLE_INPUT, type PlayerInput } from '@/sim/playerInput';
import { generateMap, mapOptionsFromConfig } from '@/sim/world/mapGen';
import { distanceField } from '@/sim/world/pathfinding';
import { placePickups } from '@/sim/world/pickupPlacement';
import { simFromAscii } from '../../helpers/maps';

const DT = 1 / 60;
// A long corridor; a pickup is placed 64 px right of the player.
const LINE = ['#######################', '#P....................#', '#######################'];

function setup(type: PickupTypeId) {
  const sim = simFromAscii(LINE);
  const { x, y } = sim.state.player;
  sim.state.pickups = [{ id: 1, type, x: x + 64, y, collected: false }];
  const sounds: SoundEmitted[] = [];
  sim.events.on('soundEmitted', (s) => s.owner === sim.state.player.id && sounds.push(s));
  const run = (input: Partial<PlayerInput>, seconds: number) => {
    for (let i = 0; i < Math.round(seconds / DT); i++) sim.step({ ...IDLE_INPUT, ...input }, DT);
  };
  return { sim, sounds, run, p: () => sim.state.player, pickup: () => sim.state.pickups[0] };
}

describe('pickups', () => {
  it('stone bag: +2 stones', () => {
    const { run, p, pickup } = setup('stoneBag');
    run({ moveX: 1 }, 0.5);
    expect(pickup().collected).toBe(true);
    expect(p().stones).toBe(GAME.player.startStones + PICKUP_TYPES.stoneBag.stones);
  });

  it('heart: +1 HP when hurt; left on the floor at full health', () => {
    const full = setup('heart');
    full.run({ moveX: 1 }, 0.5);
    expect(full.pickup().collected).toBe(false);
    expect(full.p().hp).toBe(GAME.player.hp);

    const hurt = setup('heart');
    hurt.p().hp = 1;
    hurt.run({ moveX: 1 }, 0.5);
    expect(hurt.pickup().collected).toBe(true);
    expect(hurt.p().hp).toBe(2);
  });

  it('silent boots: full speed with no footsteps or wall bumps, then back to normal', () => {
    const { run, p, sounds } = setup('silentBoots');
    run({ moveX: 1 }, 0.5); // picks them up (a step or two before that is fine)
    const before = sounds.length;
    const x0 = p().x;
    run({ moveX: 1 }, 2); // walks all the way into the end wall
    expect(p().x - x0).toBeGreaterThan(GAME.player.speed * 1.5 - 1);
    expect(sounds.length).toBe(before);

    run({ moveX: -1 }, PICKUP_TYPES.silentBoots.duration);
    expect(p().silentTime).toBe(0);
    const afterBoots = sounds.length;
    run({ moveX: 1 }, 1);
    expect(sounds.length).toBeGreaterThan(afterBoots);
  });
});

describe('placePickups', () => {
  const layout = generateMap(mapOptionsFromConfig(21));
  const counts = { stoneBag: 2, heart: 1, silentBoots: 1 };

  it('places the requested counts, the same way every time', () => {
    const a = placePickups(layout, counts);
    expect(a.filter((p) => p.type === 'stoneBag')).toHaveLength(2);
    expect(a.filter((p) => p.type === 'heart')).toHaveLength(1);
    expect(a.filter((p) => p.type === 'silentBoots')).toHaveLength(1);
    expect(placePickups(layout, counts)).toEqual(a);
  });

  it('keeps them apart, off objectives, and away from the spawn', () => {
    const { tiles } = layout;
    const picks = placePickups(layout, counts);
    const keys = picks.map((p) => tiles.index(tiles.toTile(p.x), tiles.toTile(p.y)));
    expect(new Set(keys).size).toBe(keys.length);
    const objectives = [layout.beacon, ...layout.cores].map((t) => tiles.index(t.tx, t.ty));
    for (const k of keys) expect(objectives).not.toContain(k);
    const fromSpawn = distanceField(tiles, layout.spawns);
    for (const k of keys) {
      expect(fromSpawn[k]).toBeGreaterThanOrEqual(GAME.objectives.pickupMinTilesFromSpawn);
    }
  });
});
