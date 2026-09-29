import type { HunterTypeId } from './hunters';

/**
 * All general tunables. Logic must read numbers from here (or the other
 * config files), never hard-code them.
 */

export type HearingModel = 'los' | 'path';

export const GAME = {
  loop: {
    /** Simulation updates per second (fixed timestep). */
    tickRate: 60,
    /** Largest frame delta processed at once, to survive tab switches (s). */
    maxFrameDelta: 0.25,
  },

  camera: {
    /**
     * World pixels visible along the shorter screen side, so every screen
     * (desktop, phone in portrait or landscape) sees the same amount of map.
     */
    viewSize: 520,
  },

  render: {
    /** Cap on devicePixelRatio: 3x phones cost 2.25x the pixels of 2x for little gain. */
    maxDpr: 2,
  },

  map: {
    tileSize: 32,
    /** Maze cells; tiles = cells * 2 + 1 (odd sizes are required by the backtracker). */
    cellsX: 20,
    cellsY: 12,
    /** Share of the maze's remaining inner walls (between two cells) knocked out to create loops. */
    loopRatio: 0.15,
    /** Rooms are size x size tiles; size must be odd so rooms line up with maze cells. */
    rooms: { min: 3, max: 5, size: 5, minTilesFromSpawn: 8 },
    /** Seeds tried (seed, seed+1, …) before map generation gives up. */
    maxAttempts: 20,
  },

  player: {
    hp: 3,
    radius: 8,
    speed: 140,
    sneakSpeed: 70,
    /**
     * Seconds between footsteps at walking speed. Steps are counted by
     * distance (stride = speed x interval = 49 px), so tapping the move key
     * cannot dodge them.
     */
    footstepInterval: 0.35,
    startStones: 2,
    invulnerableTime: 1,
    knockbackSpeed: 220,
    /** Knockback fades out with this time constant (s): ~95% gone after 3x. */
    knockbackDecay: 0.1,
  },

  abilities: {
    ping: { cooldown: 2.5 },
    /** Decoy stone: flies at throwRange / flightTime px/s, lands at the aim point or the first wall. */
    stone: { throwRange: 260, flightTime: 0.45, radius: 3 },
    /** Stuns hunters in line of sight within effectRadius (px). */
    shockwave: { cooldown: 6, effectRadius: 120 },
  },

  wallBump: {
    /** Speed into the wall needed to make a sound (px/s). */
    minImpactSpeed: 100,
    cooldown: 0.5,
  },

  reveal: {
    /** How long a revealed wall takes to fade out (ms). */
    fadeMs: 1500,
    /** Hunter silhouettes fade faster than walls (ms). */
    silhouetteFadeMs: 700,
  },

  hearing: {
    /** 'los' = sound blocked by walls (GDD). 'path' = travels along corridors. */
    model: 'path' as HearingModel,
    /** 'path' model: around corners, corridor distance counts as distance / pathFactor. */
    pathFactor: 0.75,
  },

  objectives: {
    coresPerLevel: 3,
    coreHumInterval: 4,
    beaconPulseInterval: 3,
    /** Distance at which a core, the beacon or a pickup is touched (px). */
    pickupRadius: 16,
    /** Pickups are placed at least this many tiles (walking) from the player spawn. */
    pickupMinTilesFromSpawn: 6,
  },

  ambient: {
    /** Drone rises in pitch when a hunter is closer than this (px). */
    hunterDroneRange: 150,
  },

  scoring: {
    core: 100,
    extraction: 500,
    timeBonusPerSecond: 10,
    /** Par time for a base-size map; scaled by map area. */
    parTime: 90,
    ghostBonus: 300,
    hunterStunned: 50,
  },

  duel: {
    /** Carry this many cores to wake the beacon; extract with them to win (GDD §8). */
    coresToWin: 2,
    /** Hits (rival shockwave or hunter) before you drop the cores you carry. */
    hitsToDropCores: 2,
    /** Seconds before the player who dropped cores may take them back (the attacker can at once). */
    dropLockSeconds: 2,
    /** Most tile steps one player may be closer to the beacon than the other. */
    beaconMaxStepDifference: 2,
    /** AI hunters that threaten both players (GDD: "optional 1–2"). */
    hunters: ['stalker'] as HunterTypeId[],
    /** No hearts: duels have no HP. */
    pickups: { stoneBag: 2, silentBoots: 1 },
    /** Own position sent this often (Hz). */
    positionSendHz: 15,
    /** Host's authoritative snapshot (cores, hunters, …) sent this often (Hz). */
    snapshotHz: 10,
    /** Remote things are drawn this far in the past, to glide between updates (s). */
    interpolationDelay: 0.12,
    /** Give up connecting after this long (s). */
    connectTimeout: 8,
    /** PeerJS ids are global: prefix room codes so they don't collide with other apps. */
    peerPrefix: 'pulse-echo-hunters-',
    /** Room code length and alphabet (no look-alike characters). */
    codeLength: 5,
    codeAlphabet: 'ABCDEFGHJKMNPQRSTUVWXYZ23456789',
  },
};
