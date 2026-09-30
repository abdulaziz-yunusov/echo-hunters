import { describe, expect, it } from 'vitest';
import { SOUND_KINDS } from '@/config/sounds';
import { SURFACE_PLACEMENT } from '@/config/surfaces';
import { setHunterState } from '@/sim/ai/hunterBrain';
import type { SoundEmitted } from '@/sim/events';
import { IDLE_INPUT, type PlayerInput } from '@/sim/playerInput';
import { generateMap, mapOptionsFromConfig } from '@/sim/world/mapGen';
import { distanceField } from '@/sim/world/pathfinding';
import { simFromAscii } from '../../helpers/maps';

const DT = 1 / 60;

function count(tiles: ReturnType<typeof generateMap>['tiles'], surface: 'metal' | 'soft') {
  let n = 0;
  for (let i = 0; i < tiles.surfaces.length; i++) {
    const { tx, ty } = tiles.coordOf(i);
    if (tiles.surface(tx, ty) === surface) n++;
  }
  return n;
}

describe('surface placement', () => {
  it('is deterministic and lies only on floor', () => {
    for (const seed of [1, 42, 999]) {
      const a = generateMap(mapOptionsFromConfig(seed));
      const b = generateMap(mapOptionsFromConfig(seed));
      expect(b.tiles.surfaces).toEqual(a.tiles.surfaces);
      for (let i = 0; i < a.tiles.surfaces.length; i++) {
        const { tx, ty } = a.tiles.coordOf(i);
        if (a.tiles.surfaces[i] !== 0) expect(a.tiles.isFloor(tx, ty)).toBe(true);
      }
    }
  });

  it('gives every map some metal and some moss, and no metal near a spawn', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const layout = generateMap(mapOptionsFromConfig(seed));
      const { tiles } = layout;
      expect(count(tiles, 'metal'), `seed ${seed}`).toBeGreaterThan(0);
      expect(count(tiles, 'soft'), `seed ${seed}`).toBeGreaterThan(0);
      const fromSpawn = distanceField(tiles, layout.spawns);
      for (let i = 0; i < tiles.surfaces.length; i++) {
        const { tx, ty } = tiles.coordOf(i);
        if (tiles.surface(tx, ty) !== 'metal') continue;
        expect(fromSpawn[i]).toBeGreaterThanOrEqual(SURFACE_PLACEMENT.metalMinFromSpawn);
      }
    }
  });

  it('puts metal on the way to objectives', () => {
    const layout = generateMap(mapOptionsFromConfig(7));
    const { tiles } = layout;
    const fromObjectives = distanceField(tiles, [layout.beacon, ...layout.cores]);
    const reach = SURFACE_PLACEMENT.metalFromObjective.max + SURFACE_PLACEMENT.patchSize;
    for (let i = 0; i < tiles.surfaces.length; i++) {
      const { tx, ty } = tiles.coordOf(i);
      if (tiles.surface(tx, ty) === 'metal') expect(fromObjectives[i]).toBeLessThanOrEqual(reach);
    }
  });

  it('grows with bigger maps', () => {
    const base = generateMap(mapOptionsFromConfig(5));
    const big = generateMap(mapOptionsFromConfig(5, { scale: 1.6 }));
    expect(count(big.tiles, 'soft')).toBeGreaterThan(count(base.tiles, 'soft'));
  });
});

function walk(rows: string[], input: Partial<PlayerInput>, seconds = 1) {
  const sim = simFromAscii(rows, { hunters: [] });
  const kinds: string[] = [];
  // Only the player's own sounds (with no cores on the map, the beacon is awake).
  sim.events.on('soundEmitted', (s) => {
    if (s.owner === sim.state.player.id) kinds.push(s.kind);
  });
  for (let i = 0; i < Math.round(seconds / DT); i++) sim.step({ ...IDLE_INPUT, ...input }, DT);
  return kinds;
}

describe('footsteps by surface', () => {
  it('clang on metal, whisper on moss, normal elsewhere', () => {
    expect(walk(['############', '#P=========#', '############'], { moveX: 1 })).toEqual(
      expect.arrayContaining(['stepMetal']),
    );
    const moss = walk(['############', '#P~~~~~~~~~#', '############'], { moveX: 1 });
    expect(moss).toContain('stepSoft');
    expect(moss).not.toContain('step');
    expect(walk(['############', '#P.........#', '############'], { moveX: 1 })).not.toContain(
      'stepMetal',
    );
  });

  it('sneaking stays silent, even on metal', () => {
    expect(
      walk(['############', '#P=========#', '############'], { moveX: 1, sneak: true }),
    ).toEqual([]);
  });

  it('a hunter walking a grate clangs too', () => {
    const sim = simFromAscii(['#############', '#P.========H#', '#############'], {
      hunters: ['stalker'],
    });
    const sounds: SoundEmitted[] = [];
    sim.events.on('soundEmitted', (s) => sounds.push(s));
    sim.step({ ...IDLE_INPUT, ping: true }, DT); // the hunter comes for the ping
    for (let i = 0; i < 90; i++) sim.step(IDLE_INPUT, DT);
    const metal = sounds.filter((s) => s.kind === 'hunterStepMetal');
    expect(metal.length).toBeGreaterThan(0);
    expect(metal.every((s) => s.owner === sim.state.hunters[0].id)).toBe(true);
  });
});

describe('hearing surface steps', () => {
  /** Does a frozen Stalker `distance` px to the right hear this footstep sound? */
  function heard(kind: 'step' | 'stepMetal' | 'stepSoft', distance: number): boolean {
    const sim = simFromAscii(['###########', '#P.......H#', '###########'], {
      hunters: ['stalker'],
    });
    const hunter = sim.state.hunters[0];
    setHunterState(sim, hunter, 'stunned'); // stands still, still hears
    const { player } = sim.state;
    hunter.x = player.x + distance;
    let got = false;
    sim.events.on('hunterHeard', () => (got = true));
    sim.emitSound(kind, player.x, player.y, player.id);
    for (let i = 0; i < 60; i++) sim.step(IDLE_INPUT, DT);
    return got;
  }

  it('metal carries further than a normal step, moss less far', () => {
    const between = (SOUND_KINDS.step.hearRadius + SOUND_KINDS.stepMetal.hearRadius) / 2;
    expect(heard('stepMetal', between)).toBe(true);
    expect(heard('step', between)).toBe(false);

    const near = (SOUND_KINDS.stepSoft.hearRadius + SOUND_KINDS.step.hearRadius) / 2;
    expect(heard('step', near)).toBe(true);
    expect(heard('stepSoft', near)).toBe(false);
  });
});
