import { GAME } from '@/config/game';
import type { GameState } from '@/sim/gameState';
import type { Simulation } from '@/sim/simulation';
import type { Camera } from './camera';
import { Effects } from './fx';
import { drawHunterDebug, drawHunterSilhouettes, hunterKey } from './hunterRenderer';
import { drawFullMap } from './mapDebug';
import { BEACON_KEY, coreKey, drawBeacon, drawCores } from './objectRenderer';
import { drawPlayer } from './playerRenderer';
import { RevealMap, type RevealableObject } from './revealMap';
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
  private readonly fadeSeconds = GAME.reveal.fadeMs / 1000;
  private readonly silhouetteSeconds = GAME.reveal.silhouetteFadeMs / 1000;

  constructor(sim: Simulation, ghostAlpha: number) {
    this.sim = sim;
    this.ghostAlpha = ghostAlpha;
    this.reveal = new RevealMap(sim.state.walls);
    this.wallLayer = new WallLayer(sim.state.walls);

    sim.events.on('soundEmitted', (s) => this.reveal.addWave(s.wave));
    sim.events.on('coreCollected', (e) => this.fx.flash(e.x, e.y, 'cyan'));
    sim.events.on('beaconActivated', (e) => this.fx.flash(e.x, e.y, 'green', 48, 0.9));
    sim.events.on('playerHit', (e) => this.fx.flash(e.x, e.y, 'red', 34, 0.5));
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
    drawWaves(ctx, state.waves, alpha / GAME.loop.tickRate, pixel);
    if (debug) {
      drawWavePolygons(ctx, state.waves, pixel);
      drawHunterDebug(ctx, state.hunters, alpha, pixel);
    }
    this.fx.draw(ctx, pixel);
    drawPlayer(ctx, state.player, alpha);
  }

  /** Debug: the whole map with everything visible. ctx must already be scaled to fit. */
  drawOverview(ctx: CanvasRenderingContext2D, pixel: number, alpha: number): void {
    const { state } = this.sim;
    drawFullMap(ctx, state.layout, state.walls, pixel, true);
    drawWavePolygons(ctx, state.waves, pixel);
    drawHunterDebug(ctx, state.hunters, alpha, pixel);
    drawPlayer(ctx, state.player, alpha);
  }

  private drawObjects(ctx: CanvasRenderingContext2D, pixel: number): void {
    const { state } = this.sim;
    const args = [this.reveal, state.time, this.fadeSeconds, this.ghostAlpha] as const;
    drawCores(ctx, state.cores, ...args);
    drawBeacon(ctx, state.beacon, ...args, pixel);
  }
}

function* revealables(state: GameState): Generator<RevealableObject> {
  for (const core of state.cores) {
    if (!core.collected) yield { key: coreKey(core), x: core.x, y: core.y };
  }
  yield { key: BEACON_KEY, x: state.beacon.x, y: state.beacon.y };
  for (const h of state.hunters) yield { key: hunterKey(h), x: h.x, y: h.y, owner: h.id };
}
