import { GAME } from '@/config/game';
import type { GameState } from '@/sim/gameState';
import { extractionProgress } from '@/sim/systems/duel';
import { rivalRevealed } from '@/sim/systems/tools';
import { playerMasked } from '@/sim/systems/emitters';
import type { Simulation } from '@/sim/simulation';
import type { Camera } from './camera';
import { drawEmitters, emitterKey } from './emitterRenderer';
import { Effects } from './fx';
import { drawHunterDebug, drawHunterSilhouettes, hunterKey } from './hunterRenderer';
import { drawFullMap } from './mapDebug';
import {
  BEACON_KEY,
  coreKey,
  drawBeacon,
  drawCores,
  drawPickupIcons,
  drawPickups,
  pickupKey,
  revealAlpha,
} from './objectRenderer';
import { drawPlayer, drawRivalOutline, drawStones, drawTraps, RIVAL_KEY } from './playerRenderer';
import { RevealMap, type RevealableObject } from './revealMap';
import { drawSurfaces, listSurfaceTiles, type SurfaceTile } from './surfaceRenderer';
import { WallLayer } from './wallLayer';
import { drawWavePolygons, drawWaves } from './waveLayer';

/** Opacity of the full map under the debug view, so real reveals stay visible on top. */
const DEBUG_MAP_ALPHA = 0.3;

/**
 * Draws one round's world: what sound has revealed, the rings, objects,
 * hunter silhouettes and the player. Owns all visual-only state (reveal times, effects) and keeps
 * it in step with the simulation through its events.
 */
export class WorldRenderer {
  private readonly sim: Simulation;
  private readonly reveal: RevealMap;
  private readonly wallLayer: WallLayer;
  private readonly fx = new Effects();
  private readonly ghostAlpha: number;
  /** Metal and moss tiles: revealed by sound like objects. */
  private readonly surfaces: SurfaceTile[];
  private readonly fadeSeconds = GAME.reveal.fadeMs / 1000;
  private readonly silhouetteSeconds = GAME.reveal.silhouetteFadeMs / 1000;

  constructor(sim: Simulation, ghostAlpha: number) {
    this.sim = sim;
    this.ghostAlpha = ghostAlpha;
    this.reveal = new RevealMap(sim.state.walls);
    this.wallLayer = new WallLayer(sim.state.walls);
    this.surfaces = listSurfaceTiles(sim.state.layout.tiles);

    sim.events.on('soundEmitted', (s) => this.reveal.addWave(s.wave));
    // Personal flashes only: in a duel they must not give the rival's position away.
    const mine = (id: number) => id === sim.state.player.id;
    sim.events.on('coreCollected', (e) => {
      if (mine(e.by)) this.fx.flash(e.x, e.y, 'cyan');
    });
    sim.events.on('beaconActivated', (e) => this.fx.flash(e.x, e.y, 'green', 48, 0.9));
    sim.events.on('playerHit', (e) => {
      if (mine(e.target)) this.fx.flash(e.x, e.y, 'red', 34, 0.5);
    });
    sim.events.on('hunterStunned', (e) => this.fx.flash(e.x, e.y, 'orange', 22, 0.6));
    sim.events.on('pickupCollected', (e) => {
      if (!mine(e.by)) return;
      const color = e.type === 'heart' ? 'red' : e.type === 'silentBoots' ? 'cyan' : 'white';
      this.fx.flash(e.x, e.y, color);
    });
  }

  /** Player setting: brightness of hit / pickup / stun flashes (0..1). */
  set flashIntensity(value: number) {
    this.fx.intensity = value;
  }

  /** Waves still revealing walls (debug). */
  get revealingWaves(): number {
    return this.reveal.activeWaves;
  }

  /** Call after every simulation tick. */
  tick(dt: number): void {
    const { state } = this.sim;
    this.reveal.update(state.time);
    this.reveal.revealObjects(state.waves, revealables(state), state.time, dt);
    this.reveal.revealObjects(state.waves, this.surfaces, state.time, dt);
    this.fx.update(dt);
  }

  /** The world as the player sees it, through the camera. */
  draw(ctx: CanvasRenderingContext2D, camera: Camera, alpha: number, debug: boolean): void {
    const { state } = this.sim;
    const { time } = state;
    const pixel = camera.pixel;

    if (debug) {
      ctx.globalAlpha = DEBUG_MAP_ALPHA;
      drawFullMap(ctx, state.layout, state.walls, pixel, true);
      ctx.globalAlpha = 1;
    }
    const { tileSize } = state.layout.tiles;
    drawSurfaces(ctx, this.surfaces, tileSize, pixel, (s) =>
      revealAlpha(this.reveal.objectRevealTime(s.key), time, this.fadeSeconds, this.ghostAlpha),
    );
    this.wallLayer.draw(
      ctx,
      this.reveal,
      time,
      camera.visibleBounds(),
      pixel,
      this.fadeSeconds,
      this.ghostAlpha,
    );
    this.drawObjects(ctx, pixel);
    drawHunterSilhouettes(ctx, state.hunters, this.reveal, time, this.silhouetteSeconds);
    drawRivalOutline(ctx, this.reveal.objectReveal(RIVAL_KEY), time, this.silhouetteSeconds, pixel);
    // Duel tools (Phase 29): your own traps, and the rival through walls after a flare or a trap.
    drawTraps(ctx, state.traps, state.player.id, pixel);
    if (state.rival && rivalRevealed(state)) {
      const left = state.duel!.revealRivalUntil - state.time;
      const seen = {
        time: time - (1 - Math.min(1, left)) * this.silhouetteSeconds,
        x: state.rival.x,
        y: state.rival.y,
      };
      drawRivalOutline(ctx, seen, time, this.silhouetteSeconds, pixel);
    }
    drawWaves(ctx, state.waves, alpha / GAME.loop.tickRate, pixel);
    if (debug) {
      drawWavePolygons(ctx, state.waves, pixel);
      drawHunterDebug(ctx, state.hunters, alpha, pixel);
      drawPickupIcons(ctx, state.pickups, pixel, () => 0.5);
    }
    this.fx.draw(ctx, pixel);
    drawStones(ctx, state.stones, alpha);
    drawPlayer(ctx, state.player, alpha, playerMasked(state));
  }

  /** Debug: the whole map with everything visible. ctx must already be scaled to fit. */
  drawOverview(ctx: CanvasRenderingContext2D, pixel: number, alpha: number): void {
    const { state } = this.sim;
    drawFullMap(ctx, state.layout, state.walls, pixel, true);
    drawSurfaces(ctx, this.surfaces, state.layout.tiles.tileSize, pixel, () => 1);
    drawEmitters(ctx, state.emitters, null, state.time, 1, 0, pixel);
    drawWavePolygons(ctx, state.waves, pixel);
    drawHunterDebug(ctx, state.hunters, alpha, pixel);
    drawPickupIcons(ctx, state.pickups, pixel, () => 1);
    drawPlayer(ctx, state.player, alpha);
  }

  private drawObjects(ctx: CanvasRenderingContext2D, pixel: number): void {
    const { state } = this.sim;
    const args = [this.reveal, state.time, this.fadeSeconds, this.ghostAlpha] as const;
    drawCores(ctx, state.cores, ...args);
    drawBeacon(ctx, state.beacon, ...args, pixel, extractionProgress(state));
    drawPickups(ctx, state.pickups, ...args, pixel);
    drawEmitters(ctx, state.emitters, ...args, pixel);
  }
}

function* revealables(state: GameState): Generator<RevealableObject> {
  for (const core of state.cores) {
    if (!core.collected) yield { key: coreKey(core), x: core.x, y: core.y };
  }
  yield { key: BEACON_KEY, x: state.beacon.x, y: state.beacon.y };
  for (const p of state.pickups) {
    if (!p.collected) yield { key: pickupKey(p), x: p.x, y: p.y };
  }
  for (const e of state.emitters) yield { key: emitterKey(e), x: e.x, y: e.y };
  for (const h of state.hunters) yield { key: hunterKey(h), x: h.x, y: h.y, owner: h.id };
  const rival = state.rival;
  if (rival) yield { key: RIVAL_KEY, x: rival.x, y: rival.y, owner: rival.id };
}
