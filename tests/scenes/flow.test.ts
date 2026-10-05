import { describe, expect, it, vi } from 'vitest';
import type { AudioEngine } from '@/audio/audioEngine';
import type { SoundOutput } from '@/audio/soundOutput';
import { AUDIO } from '@/config/audio';
import { PALETTES, THEME } from '@/config/theme';
import { loadSave } from '@/platform/storage';
import { applyPalette } from '@/render/palette';
import type { Bindings } from '@/input/bindings';
import { EMPTY_INPUT, type InputFrame } from '@/input/inputFrame';
import type { InputManager } from '@/input/inputManager';
import type { AudioSettings } from '@/platform/storage';
import type { Viewport } from '@/platform/viewport';
import type { DebugLayer } from '@/render/debugLayer';
import { createScene } from '@/scenes/registry';
import { newRun } from '@/scenes/run';
import type { AppContext, SceneArgs, SceneId } from '@/scenes/scene';
import { SceneManager } from '@/scenes/sceneManager';
import { ROW_HEIGHT, type MenuList } from '@/ui/menuList';
import type { DuelEndScene } from '@/scenes/duelEndScene';
import { GUEST_ID } from '@/sim/entities/entity';
import { EXTRACT_TICKS, flushLink, recordedDuel, seriesPair } from '../helpers/duel';
import { GAME } from '@/config/game';
import { PLAYER_ID } from '@/sim/entities/entity';
import { ReplayRecorder } from '@/replay/recorder';
import { EDITOR_TOOLS } from '@/config/editor';
import { dailyDate, dailySeed } from '@/platform/daily';
import { emptyMap, encodeMap, mapFromLayout } from '@/sim/world/customMap';
import { generateMap, mapOptionsFromConfig } from '@/sim/world/mapGen';
import type { RunState } from '@/scenes/run';
import { toWire } from '@/replay/wire';
import { IDLE_INPUT } from '@/sim/playerInput';
import { createSimulation, type Simulation } from '@/sim/simulation';
import { UPGRADE_IDS, UPGRADE_OFFER_SIZE, UPGRADES, type UpgradeId } from '@/config/upgrades';
import { buildRules } from '@/sim/rules';
import { offerUpgrades } from '@/sim/upgrades';
import { levelModifier } from '@/sim/modifiers';
import { Bot } from '@/bot/bot';
import { ghostKey, submitGhost } from '@/platform/ghostStore';
import { pathFromReplay, type GhostTrack } from '@/replay/ghostPath';
import { samplePointAt, trackPosition } from '@/replay/replay';
import type { RevealMap } from '@/render/revealMap';
import { GHOST_KEY } from '@/render/playerRenderer';
import { roundResult, scoreRound } from '@/sim/scoring';

const DT = 1 / 60;

/**
 * A canvas context that accepts every call and draws nothing, so scenes can
 * render (and lay out their menus) in tests.
 */
const fakeCtx = new Proxy({} as Record<string | symbol, unknown>, {
  get: (target, prop) => {
    if (prop in target) return target[prop];
    if (prop === 'measureText') return () => ({ width: 100 });
    if (typeof prop === 'string' && prop.startsWith('create')) return () => ({ addColorStop() {} });
    return () => {};
  },
  set: (target, prop, value) => {
    target[prop] = value;
    return true;
  },
}) as unknown as CanvasRenderingContext2D;

/** 1.5 s of a real level 3 round with a ping in it. */
function recordedRound() {
  const sim = createSimulation({ seed: 3, level: 3 });
  const recorder = new ReplayRecorder(sim, 3);
  for (let i = 0; i < 90; i++) {
    sim.step({ ...IDLE_INPUT, moveX: 1, ping: i === 10 }, DT);
    recorder.afterStep();
  }
  return recorder.finish();
}

/** The real scenes and scene manager, with every browser service faked. */
function testApp() {
  const scenes = new SceneManager();
  let audio: AudioSettings = { muted: false, ...AUDIO.volumes };
  let capture: ((id: string) => void) | null = null;
  const bound: Bindings[] = [];
  const quietDrone: SoundOutput = { play() {}, setDrone() {}, stopDrone() {} };

  const app: AppContext = {
    viewport: {
      width: 1280,
      height: 720,
      worldWidth: 924,
      worldHeight: 520,
      worldScale: 1.38,
      dpr: 1,
    } as Viewport,
    debug: { enabled: false, watch() {}, clearWatches() {} } as unknown as DebugLayer,
    audio: {
      getSettings: () => ({ ...audio }),
      setSettings: (s: AudioSettings) => (audio = { ...s }),
      muted: false,
    } as unknown as AudioEngine,
    sound: quietDrone,
    input: {
      captureNextInput: (cb: (id: string) => void) => (capture = cb),
      cancelCapture: () => (capture = null),
      setBindings: (b: Bindings) => bound.push(b),
    } as unknown as InputManager,
    goTo<K extends SceneId>(id: K, ...args: SceneArgs<K>) {
      scenes.switchTo(createScene(app, id, ...args));
    },
    open<K extends SceneId>(id: K, ...args: SceneArgs<K>) {
      scenes.push(createScene(app, id, ...args));
    },
    close() {
      if (scenes.depth > 1) scenes.pop();
    },
  };

  const press = (f: Partial<InputFrame>) => scenes.update(DT, { ...EMPTY_INPUT, ...f });
  const idle = (seconds: number) => {
    for (let i = 0; i < seconds / DT; i++) press({});
  };
  /** Keyboard: move the selection down n rows, then Enter. */
  const choose = (downs: number) => {
    for (let i = 0; i < downs; i++) press({ navY: 1 });
    press({ confirm: true });
  };
  const current = () => scenes.current?.name;
  const render = () => scenes.render(fakeCtx, 0);
  const stack = () => scenes.depth;
  return {
    app,
    scenes,
    press,
    idle,
    choose,
    current,
    render,
    stack,
    audio: () => audio,
    bound,
    capture: () => capture,
  };
}

describe('screen flow', () => {
  it('menu → settings → controls, and back with ESC each time', () => {
    const t = testApp();
    t.app.goTo('menu');
    t.choose(6); // PLAY, DAILY, DUEL, DIFFICULTY, MAP EDITOR, HOW TO PLAY, SETTINGS
    expect(t.current()).toBe('Settings');
    t.choose(10); // … SOUND, SOUND CUES, SCREEN SHAKE, FLASHES, COLORS, GLOW, GHOST, CONTROLS
    expect(t.current()).toBe('Controls');
    t.press({ back: true });
    expect(t.current()).toBe('Settings');
    t.press({ back: true });
    expect(t.current()).toBe('Menu');
  });

  it('menu → how to play → back', () => {
    const t = testApp();
    t.app.goTo('menu');
    t.choose(5); // HOW TO PLAY
    expect(t.current()).toBe('HowToPlay');
    t.press({ back: true });
    expect(t.current()).toBe('Menu');
  });

  it('settings change the audio and are applied at once', () => {
    const t = testApp();
    t.app.goTo('menu');
    t.app.open('settings');
    const before = t.audio().master;
    t.press({ navX: -1 }); // master volume down
    expect(t.audio().master).toBeCloseTo(before - 0.1, 5);
    t.choose(3); // SOUND ON/OFF
    expect(t.audio().muted).toBe(true);
  });

  it('display settings are saved and applied, the palette at once', () => {
    const data = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => void data.set(k, v),
    });
    try {
      const t = testApp();
      t.app.goTo('menu');
      t.app.open('settings');
      t.choose(4); // SOUND CUES: OFF → ON
      t.press({ navY: 1 }); // SCREEN SHAKE
      t.press({ navX: -1 }); // 100% → 50%
      t.press({ navY: 1 });
      t.press({ navY: 1 }); // COLORS
      t.press({ navX: 1 }); // STANDARD → COLORBLIND
      expect(loadSave().display).toMatchObject({
        soundCues: true,
        shake: 0.5,
        palette: 'colorblind',
      });
      expect(THEME.colors.green).toBe(PALETTES.colorblind.green);
      t.render();
    } finally {
      applyPalette('standard');
      vi.unstubAllGlobals();
    }
  });

  it('play → ESC pauses over the game; resume and quit work', () => {
    const t = testApp();
    t.app.goTo('play', { run: newRun(1, 'easy') });
    t.press({ pause: true });
    expect(t.current()).toBe('Pause');
    expect(t.stack()).toBe(2); // the game waits underneath
    t.press({ confirm: true }); // RESUME
    expect(t.current()).toBe('Play');

    t.press({ pause: true });
    t.choose(2); // SETTINGS, over the pause menu
    expect(t.current()).toBe('Settings');
    t.press({ back: true });
    expect(t.current()).toBe('Pause');
    t.choose(1); // the menu remembers SETTINGS; one down is QUIT TO MENU
    expect(t.current()).toBe('Menu');
    expect(t.stack()).toBe(1);
  });

  it('the game does not run while paused', () => {
    const t = testApp();
    t.app.goTo('play', { run: newRun(1, 'easy') });
    const play = t.scenes.current as unknown as { sim: { state: { time: number } } };
    t.idle(0.5);
    const time = play.sim.state.time;
    t.press({ pause: true });
    t.idle(2);
    expect(play.sim.state.time).toBe(time);
  });

  it('hiding the tab pauses the game', () => {
    const t = testApp();
    t.app.goTo('play', { run: newRun(1, 'easy') });
    t.scenes.current?.onHidden?.();
    t.press({});
    expect(t.current()).toBe('Pause');
  });

  it('controls: pick an action, press a key, it is rebound', () => {
    const t = testApp();
    t.app.goTo('menu');
    t.app.open('controls');
    t.choose(5); // SONAR PING
    expect(t.capture()).not.toBeNull();
    t.capture()?.('KeyF');
    expect(t.bound.at(-1)?.ping[0]).toBe('KeyF');
  });

  it('level end and game over can be left with the mouse', () => {
    const t = testApp();
    const score = {
      cores: 0,
      extraction: 0,
      timeBonus: 0,
      ghostBonus: 0,
      stuns: 0,
      closeCalls: 0,
      modifier: 0,
      total: 0,
    };
    t.app.goTo('gameOver', { run: newRun(1, 'easy'), score });
    t.idle(1);
    t.render(); // menus place their rows when drawn
    t.press({ aim: { x: 640, y: 360 + 96 + ROW_HEIGHT } }); // hover MAIN MENU
    t.press({ click: true, confirm: true, aim: { x: 640, y: 360 + 96 + ROW_HEIGHT } });
    expect(t.current()).toBe('Menu');
  });

  it('level end → REPLAY → ESC comes back to the same level end', () => {
    const t = testApp();
    const score = {
      cores: 0,
      extraction: 0,
      timeBonus: 0,
      ghostBonus: 0,
      stuns: 0,
      closeCalls: 0,
      modifier: 0,
      total: 0,
    };
    const replay = recordedRound();
    t.app.goTo('levelEnd', { run: newRun(1, 'easy'), score, seconds: 30, replay });
    t.idle(1);
    t.choose(1); // NEXT, REPLAY
    expect(t.current()).toBe('Replay');
    expect(t.stack()).toBe(2);
    t.render();
    t.press({ back: true });
    expect(t.current()).toBe('LevelEnd');
    expect(t.stack()).toBe(1);
  });

  it('the replay plays, pauses, seeks and changes speed', () => {
    const t = testApp();
    const replay = recordedRound();
    t.app.goTo('replay', { replay });
    const scene = t.scenes.current as unknown as {
      position: number;
      speed: number;
      isPlaying: boolean;
    };
    t.idle(0.5);
    expect(scene.isPlaying).toBe(true);
    expect(scene.position).toBeCloseTo(0.5, 1);
    t.press({ confirm: true });
    expect(scene.isPlaying).toBe(false);
    const paused = scene.position;
    t.idle(0.5);
    expect(scene.position).toBe(paused);
    t.press({ navX: 1 });
    expect(scene.position).toBeCloseTo(Math.min(paused + 5, 1.5), 5);
    t.press({ navY: -1 });
    expect(scene.speed).toBe(2);
    t.render();
  });

  it('a round played in the game can be replayed after game over', () => {
    const t = testApp();
    t.app.goTo('play', { run: newRun(7, 'easy') });
    const { sim } = t.scenes.current as unknown as { sim: Simulation };
    t.idle(0.5);
    // Waiting for a hunter is slow: end the round as combat does when HP runs out.
    sim.state.status = 'dead';
    sim.events.emit('roundEnded', { status: 'dead', time: sim.state.time });
    t.idle(1.5);
    expect(t.current()).toBe('GameOver');
    t.idle(1);
    t.choose(1); // NEW RUN, REPLAY
    expect(t.current()).toBe('Replay');
    t.render();
  });

  it('duel end: the host opens the debrief at once, as itself', () => {
    const { hostNet, replay } = recordedDuel();
    const t = testApp();
    t.app.goTo('duelEnd', { outcome: 'lost', net: hostNet, replay, viewerId: 1 });
    t.idle(1);
    t.choose(0); // MAP
    expect(t.current()).toBe('Replay');
    expect((t.scenes.current as unknown as { viewerId: number }).viewerId).toBe(1);
    t.render();
    t.press({ back: true });
    expect(t.current()).toBe('DuelEnd');
    // Leaving the screen closes the connection it was handed.
    t.choose(2); // MAP, NEW DUEL, MAIN MENU
    expect(t.current()).toBe('Menu');
    expect(hostNet.disconnected).toBe(true);
  });

  it('duel end: the client waits for the recording, then opens the debrief as itself', async () => {
    const { hostNet, clientNet, link, replay } = recordedDuel();
    const t = testApp();
    t.app.goTo('duelEnd', { outcome: 'won', net: clientNet, viewerId: 2 });
    t.idle(1);
    const scene = t.scenes.current as DuelEndScene;
    expect(scene.debrief).toBeNull();
    t.render(); // MAP shows RECEIVING…

    hostNet.shareRecording(replay);
    await flushLink(link);
    t.idle(0.1);
    expect(scene.debrief).not.toBeNull();
    t.press({ navY: -1 }); // the selection stayed on NEW DUEL: up to MAP
    t.press({ confirm: true });
    expect(t.current()).toBe('Replay');
    expect((t.scenes.current as unknown as { viewerId: number }).viewerId).toBe(2);
    t.render();
  });

  it('duel end: if the host leaves first, MAP says the recording never came', () => {
    const { hostNet, clientNet, link } = recordedDuel();
    const t = testApp();
    t.app.goTo('duelEnd', { outcome: 'won', net: clientNet, viewerId: 2 });
    hostNet.dispose();
    link.pump();
    t.idle(1);
    const map = (t.scenes.current as unknown as { menu: MenuList }).menu.items[0];
    expect(map).toMatchObject({ label: 'MAP', disabled: true, note: 'NOT RECEIVED' });
  });

  /** Both sides of an online series, each in its own app, on one link. */
  function seriesApps(bestOf: number) {
    const pair = seriesPair(bestOf);
    const host = testApp();
    const client = testApp();
    host.app.goTo('duel', { series: pair.host, seed: 9 });
    client.app.goTo('duel', { series: pair.client, seed: 9 });
    const tick = (n: number, hostInput: Partial<InputFrame> = {}, clientInput = hostInput) => {
      for (let i = 0; i < n; i++) {
        host.press(hostInput);
        client.press(clientInput);
        pair.link.pump();
      }
    };
    const simOf = (t: ReturnType<typeof testApp>) =>
      (t.scenes.current as unknown as { sim: Simulation }).sim.state;
    /** `side` walks (teleports) onto two cores, then the beacon; the end lingers, both reach Duel End. */
    const win = async (side: 'host' | 'client') => {
      const me = simOf(side === 'host' ? host : client);
      for (const spot of [...me.cores.slice(0, 2), me.beacon]) {
        me.player.x = me.player.prevX = spot.x;
        me.player.y = me.player.prevY = spot.y;
        tick(30);
      }
      tick(EXTRACT_TICKS);
      expect(me.status).toBe('extracted');
      tick(150); // the end lingers 2 s
      await flushLink(pair.link);
      tick(60); // past Duel End's input grace
      expect(host.current()).toBe('DuelEnd');
      expect(client.current()).toBe('DuelEnd');
    };
    const end = (t: ReturnType<typeof testApp>) => t.scenes.current as DuelEndScene;
    const labels = (t: ReturnType<typeof testApp>) =>
      (end(t) as unknown as { menu: MenuList }).menu.items.map((i) => i.label);
    return { pair, host, client, tick, simOf, win, end, labels };
  }

  it('a duel played in the scenes ends with the same debrief and stats on both sides', async () => {
    const { host, client, win, end } = seriesApps(1);
    await win('client');
    const hostDebrief = end(host).debrief;
    const clientDebrief = end(client).debrief;
    expect(hostDebrief?.duel?.winner).toBe(2);
    expect(clientDebrief).not.toBeNull();
    expect(toWire(clientDebrief!)).toEqual(toWire(hostDebrief!));
    expect(end(client).roundStats).toEqual(end(host).roundStats);
    expect(end(host).roundStats![2].cores).toBe(2);
    host.render();
    client.render();
  });

  it('a best of 3 in the scenes: READY, countdown, swapped corners, the series, then REMATCH', async () => {
    const s = seriesApps(3);
    const { host, client, tick, win, labels, pair } = s;
    await win('host');
    expect(labels(host)).toEqual(['READY', 'MAP', 'LEAVE SERIES', 'MAIN MENU']);
    host.press({ confirm: true }); // READY
    tick(5);
    expect(labels(host)[0]).toBe('READY'); // disabled now, waiting
    expect(pair.client.rivalIsReady).toBe(true);
    client.press({ confirm: true });
    tick(5);
    expect(host.current()).toBe('DuelEnd'); // the countdown
    host.render();
    tick((GAME.duel.series.countdown - 0.5) / DT);
    expect(host.current()).toBe('DuelEnd');
    tick(60);
    expect(host.current()).toBe('Duel');
    expect(client.current()).toBe('Duel');
    // Round 2: corners swapped.
    const round2 = s.simOf(host);
    const { layout } = round2;
    expect({ x: round2.player.x, y: round2.player.y }).toEqual(
      layout.tiles.center(layout.spawns[1]),
    );
    host.render();

    await win('host');
    expect(pair.host.over).toBe(true);
    expect(pair.client.champion).toBe(PLAYER_ID);
    expect(labels(client)).toEqual(['REMATCH', 'MAP', 'NEW DUEL', 'MAIN MENU']);
    client.render();
    // Rematch: straight into a new round 1, same link.
    host.press({ confirm: true });
    client.press({ confirm: true });
    tick(5);
    expect(host.current()).toBe('Duel');
    expect(client.current()).toBe('Duel');
    expect(pair.host.round).toBe(1);
    expect(pair.host.history).toEqual([]);
  });

  it('a rival who leaves between rounds: "Rival left", and no READY', async () => {
    const { host, client, tick, win, labels, end } = seriesApps(3);
    await win('client');
    client.choose(2); // READY, MAP, LEAVE SERIES
    expect(client.current()).toBe('DuelLobby');
    tick(5);
    expect(labels(host)).toEqual(['MAP', 'NEW DUEL', 'MAIN MENU']);
    expect((end(host) as unknown as { statusLine(): string }).statusLine()).toBe('Rival left.');
  });

  describe('connection quality (Phase 31)', () => {
    /** A round under way, both sides in their duel scenes. */
    function playing() {
      const s = seriesApps(3);
      s.tick(60);
      return s;
    }
    const duelOf = (t: ReturnType<typeof testApp>) =>
      t.scenes.current as unknown as {
        sim: Simulation;
        canClaim: boolean;
        menu: MenuList;
        onHidden(): void;
        onShown(): void;
      };

    it('a drop freezes the round; the rejoin carries on', async () => {
      const { pair, host, client, tick } = playing();
      const before = duelOf(host).sim.state.time;
      pair.link.drop();
      tick(60);
      expect(duelOf(host).sim.state.time).toBe(before); // frozen while waiting
      expect(host.current()).toBe('Duel');
      host.render();
      client.render();
      await flushLink(pair.link);
      tick(30);
      expect(duelOf(host).sim.state.time).toBeGreaterThan(before);
      expect(pair.host.transport.state).toBe('open');
    });

    it('a rival who never comes back: the host wins by forfeit, the client has lost the connection', () => {
      const { pair, host, client, tick, end } = playing();
      pair.link.setReachable(false);
      pair.link.drop();
      tick((GAME.duel.link.reconnectGrace + 0.5) / DT);
      expect(client.current()).toBe('DuelEnd');
      expect((end(client) as unknown as { params: { outcome: string } }).params.outcome).toBe(
        'disconnected',
      );
      tick(150); // the host's round ends as a win, and lingers
      expect(host.current()).toBe('DuelEnd');
      const params = (end(host) as unknown as { params: { outcome: string; forfeit: boolean } })
        .params;
      expect(params).toMatchObject({ outcome: 'won', forfeit: true });
      host.render();
    });

    it('a rival away too long can be claimed against, from the menu', () => {
      const { pair, host, client, tick, end } = playing();
      duelOf(client).onHidden();
      // The client's tab is hidden: only the host's game runs now.
      const hostOnly = (n: number) => {
        for (let i = 0; i < n; i++) {
          host.press({});
          pair.link.pump();
        }
      };
      hostOnly(10);
      expect(duelOf(host).canClaim).toBe(false);
      host.render();
      hostOnly((GAME.duel.link.awayForfeit + 0.2) / DT);
      expect(duelOf(host).canClaim).toBe(true);
      host.press({ pause: true });
      const labels = duelOf(host).menu.items.map((i) => i.label);
      expect(labels).toContain('CLAIM THE WIN');
      host.choose(1); // RESUME, CLAIM THE WIN
      duelOf(client).onShown();
      tick(150);
      expect(host.current()).toBe('DuelEnd');
      expect(client.current()).toBe('DuelEnd');
      expect(
        (end(client) as unknown as { params: { outcome: string; forfeit: boolean } }).params,
      ).toMatchObject({ outcome: 'lost', forfeit: true });
    });

    it('the client can claim against an away host; the host agrees only if it really is away', () => {
      const { pair, host, client, tick } = playing();
      const clientNet = (client.scenes.current as unknown as { net: { claimWin(): void } }).net;
      clientNet.claimWin(); // the host is here: refused
      tick(10);
      expect(duelOf(host).sim.state.duel!.winner).toBeNull();
      duelOf(host).onHidden();
      pair.link.pump();
      clientNet.claimWin();
      for (let i = 0; i < 10; i++) pair.link.pump(); // a hidden host still handles messages
      expect(duelOf(host).sim.state.duel!.winner).toBe(2);
      expect(duelOf(host).sim.state.duel!.forfeit).toBe(true);
    });

    it('a rival on another version: the host is told why they left', () => {
      const { pair, host, tick } = playing();
      pair.client.transport.send({ t: 'bye', reason: 'version' });
      pair.link.pump();
      pair.link.pump();
      pair.link.drop();
      tick(5);
      expect(host.current()).toBe('DuelEnd');
      expect(
        (host.scenes.current as unknown as { params: { outcome: string } }).params.outcome,
      ).toBe('version');
      host.render();
    });
  });

  it('a rival who leaves during the countdown stops it', async () => {
    const { host, client, tick, win, pair } = seriesApps(3);
    await win('client');
    host.press({ confirm: true });
    client.press({ confirm: true });
    tick(30);
    expect(pair.host.upcoming).not.toBeNull();
    client.press({ back: true }); // ESC: leaves
    tick(10 / DT);
    expect(host.current()).toBe('DuelEnd');
    expect(pair.host.rivalLeft).toBe(true);
  });

  it('duel lobby → pick the bot level → PRACTICE VS BOT starts an offline duel', () => {
    const data = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => void data.set(k, v),
    });
    try {
      const t = testApp();
      t.app.goTo('menu');
      t.choose(2); // DUEL
      expect(t.current()).toBe('DuelLobby');
      // HOST, SERIES, VARIANT, JOIN, PRACTICE, BOT
      for (let i = 0; i < 5; i++) t.press({ navY: 1 });
      t.press({ navX: 1 }); // NORMAL → HARD
      expect(loadSave().duelBot).toBe('hard');
      t.press({ navY: -4 }); // SERIES
      t.press({ navX: 1 }); // BEST OF 3 → 5
      expect(loadSave().duelBestOf).toBe(5);
      t.press({ navY: 1 }); // VARIANT
      t.press({ navX: -1 }); // CLASSIC → RANDOM (wraps)
      expect(loadSave().duelVariant).toBe('random');
      t.press({ navX: -1 }); // RANDOM → ECHO CHAMBER
      expect(loadSave().duelVariant).toBe('echoChamber');
      t.press({ navY: 2 }); // PRACTICE VS BOT
      t.press({ confirm: true });
      expect(t.current()).toBe('Duel');
      const duel = t.scenes.current as unknown as {
        practice: string;
        rival: unknown;
        variant: string;
        sim: Simulation;
      };
      expect(duel.practice).toBe('hard');
      expect(duel.rival).not.toBeNull();
      expect(duel.variant).toBe('echoChamber');
      expect(duel.sim.state.rules.soundHearing).toBe(1.5);
      t.render();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('a practice duel pauses with the menu or a hidden tab', () => {
    const t = testApp();
    t.app.goTo('duel', { practice: 'normal', seed: 3 });
    const duel = t.scenes.current as unknown as {
      sim: Simulation;
      rival: { sim: Simulation };
    };
    t.idle(0.5);
    const time = duel.sim.state.time;
    const botTime = duel.rival.sim.state.time;
    expect(botTime).toBeGreaterThan(0);
    t.press({ pause: true });
    t.idle(2);
    expect(duel.sim.state.time).toBe(time);
    expect(duel.rival.sim.state.time).toBe(botTime);
    t.render();
    t.press({ confirm: true }); // RESUME
    t.idle(0.5);
    expect(duel.sim.state.time).toBeGreaterThan(time);

    const paused = duel.sim.state.time;
    t.scenes.current?.onHidden?.();
    t.idle(1);
    expect(duel.sim.state.time).toBe(paused);
  });

  it('a practice duel plays to the end, shows the debrief, and PLAY AGAIN starts another', () => {
    const t = testApp();
    t.app.goTo('duel', { practice: 'easy', seed: 8 });
    const duel = t.scenes.current as unknown as { sim: Simulation };
    // Standing still: the bot takes the cores and extracts.
    for (let i = 0; i < 300 / DT && t.current() === 'Duel'; i++) t.press({});
    expect(duel.sim.state.duel!.winner).toBe(GUEST_ID);
    expect(t.current()).toBe('DuelEnd');
    t.idle(1);
    t.render();
    const end = t.scenes.current as DuelEndScene;
    expect(end.debrief?.duel?.winner).toBe(GUEST_ID);
    const labels = (end as unknown as { menu: MenuList }).menu.items.map((i) => i.label);
    expect(labels).toEqual(['MAP', 'PLAY AGAIN', 'DUEL MENU', 'MAIN MENU']);
    t.choose(1); // PLAY AGAIN
    expect(t.current()).toBe('Duel');
    expect((t.scenes.current as unknown as { practice: string }).practice).toBe('easy');
  });

  describe('map editor and daily run (Phase 13)', () => {
    type Editor = {
      encoded: string;
      playable: boolean;
      toolChips: { x: number; y: number; w: number; h: number }[];
      actionChips: { x: number; y: number; w: number; h: number }[];
      grid: { x: number; y: number; cell: number };
    };
    const editorOf = (t: ReturnType<typeof testApp>) => t.scenes.current as unknown as Editor;
    const centre = (c: { x: number; y: number; w: number; h: number }) => ({
      x: c.x + c.w / 2,
      y: c.y + c.h / 2,
    });
    /** Click at a spot (press, then release). */
    const clickAt = (t: ReturnType<typeof testApp>, at: { x: number; y: number }) => {
      t.press({ click: true, clickHeld: true, aim: at });
      t.press({ aim: at });
    };
    const tool = (t: ReturnType<typeof testApp>, label: string) =>
      clickAt(t, centre(editorOf(t).toolChips[EDITOR_TOOLS.findIndex((x) => x.label === label)]));
    const action = (t: ReturnType<typeof testApp>, index: number) =>
      clickAt(t, centre(editorOf(t).actionChips[index]));
    const cell = (t: ReturnType<typeof testApp>, tx: number, ty: number) => {
      const g = editorOf(t).grid;
      return { x: g.x + (tx + 0.5) * g.cell, y: g.y + (ty + 0.5) * g.cell };
    };

    it('build a map from empty, see what is missing, then test-play it', () => {
      const t = testApp();
      t.app.goTo('menu');
      t.choose(4); // PLAY, DAILY, DUEL, DIFFICULTY, MAP EDITOR
      expect(t.current()).toBe('Editor');
      t.render(); // lays out the palette and the grid
      action(t, 4); // NEW EMPTY
      t.render();
      expect(editorOf(t).playable).toBe(false);
      action(t, 0); // TEST PLAY: not yet
      expect(t.current()).toBe('Editor');

      // Drag a wall across, then undo the whole stroke.
      tool(t, 'WALL');
      t.press({ click: true, clickHeld: true, aim: cell(t, 3, 2) });
      for (let x = 4; x < 9; x++) t.press({ clickHeld: true, aim: cell(t, x, 2) });
      t.press({ aim: cell(t, 9, 2) });
      const walled = editorOf(t).encoded;
      expect(walled).not.toBe(encodeMap(emptyMap(41, 25)));
      action(t, 2); // UNDO
      expect(editorOf(t).encoded).toBe(encodeMap(emptyMap(41, 25)));

      for (const [label, tx, ty] of [
        ['START', 2, 2],
        ['CORE', 10, 5],
        ['BEACON', 30, 20],
        ['STALKER', 20, 10],
      ] as const) {
        tool(t, label);
        clickAt(t, cell(t, tx, ty));
      }
      t.render();
      expect(editorOf(t).playable).toBe(true);
      const map = editorOf(t).encoded;
      action(t, 0); // TEST PLAY
      expect(t.current()).toBe('Play');
      const run = (t.scenes.current as unknown as { run: { custom?: string } }).run;
      expect(run.custom).toBe(map);
      t.render();
    });

    it('a shared map opens in the editor as it was', () => {
      const t = testApp();
      const text = encodeMap(mapFromLayout(generateMap(mapOptionsFromConfig(3))));
      t.app.goTo('editor', { map: text });
      t.render();
      expect(editorOf(t).encoded).toBe(text);
      expect(editorOf(t).playable).toBe(true);
    });

    it('a custom map ends with PLAY AGAIN and EDIT MAP, and never touches the high score', () => {
      const data = new Map<string, string>();
      vi.stubGlobal('localStorage', {
        getItem: (k: string) => data.get(k) ?? null,
        setItem: (k: string, v: string) => void data.set(k, v),
      });
      try {
        const t = testApp();
        const custom = encodeMap(mapFromLayout(generateMap(mapOptionsFromConfig(3))));
        const run = newRun(1, 'easy', { custom });
        const score = {
          cores: 300,
          extraction: 500,
          timeBonus: 0,
          ghostBonus: 0,
          stuns: 0,
          closeCalls: 0,
          modifier: 0,
          total: 800,
        };
        t.app.goTo('levelEnd', { run, score, seconds: 40 });
        expect(loadSave().highScore).toBe(0);
        const labels = (t.scenes.current as unknown as { menu: MenuList }).menu.items.map(
          (i) => i.label,
        );
        expect(labels).toEqual(['PLAY AGAIN', 'EDIT MAP', 'MAIN MENU']);
        t.render();
        t.idle(1);
        t.choose(1); // EDIT MAP
        expect(t.current()).toBe('Editor');
        t.render();
        expect(editorOf(t).encoded).toBe(custom);

        t.app.goTo('gameOver', { run, score });
        expect(loadSave().highScore).toBe(0);
        t.render();
      } finally {
        vi.unstubAllGlobals();
      }
    });

    it("the daily run is today's seed, and its game over offers a result to share", () => {
      const t = testApp();
      t.app.goTo('menu');
      t.choose(1); // DAILY RUN
      expect(t.current()).toBe('Play');
      const run = (t.scenes.current as unknown as { run: RunState }).run;
      expect(run.daily).toBe(dailyDate());
      expect(run.seed).toBe(dailySeed(dailyDate()));
      t.render();
      const score = {
        cores: 100,
        extraction: 0,
        timeBonus: 0,
        ghostBonus: 0,
        stuns: 0,
        closeCalls: 0,
        modifier: 0,
        total: 100,
      };
      t.app.goTo('gameOver', { run, score });
      const labels = (t.scenes.current as unknown as { menu: MenuList }).menu.items.map(
        (i) => i.label,
      );
      expect(labels).toEqual(['COPY RESULT', 'TRY TODAY AGAIN', 'MAIN MENU']);
      t.render();
    });
  });

  describe('upgrades between levels (Phase 20)', () => {
    const score = {
      cores: 300,
      extraction: 500,
      timeBonus: 0,
      ghostBonus: 0,
      stuns: 0,
      closeCalls: 0,
      modifier: 0,
      total: 800,
    };
    type Pick = { offers: UpgradeId[]; cards: { x: number; y: number; w: number; h: number }[] };
    const pickScene = (t: ReturnType<typeof testApp>) => t.scenes.current as unknown as Pick;
    const playing = (t: ReturnType<typeof testApp>) =>
      t.scenes.current as unknown as { run: RunState; sim: Simulation };

    it('NEXT leads to three cards; the one picked is kept and changes the rules', () => {
      const t = testApp();
      t.app.goTo('levelEnd', { run: newRun(9, 'easy'), score, seconds: 30 });
      t.idle(1);
      t.choose(0); // NEXT: LEVEL 2
      expect(t.current()).toBe('UpgradePick');
      const { offers } = pickScene(t);
      expect(offers).toEqual(offerUpgrades(9, 2, []));
      expect(offers).toHaveLength(UPGRADE_OFFER_SIZE);
      t.render();
      t.press({ confirm: true }); // too soon: the Enter that left Level End
      expect(t.current()).toBe('UpgradePick');
      t.idle(1);
      t.press({ back: true }); // no skipping
      expect(t.current()).toBe('UpgradePick');
      t.press({ navX: 1 });
      t.press({ confirm: true });
      expect(t.current()).toBe('Play');
      const { run, sim } = playing(t);
      expect(run).toMatchObject({ level: 2, score: 800, upgrades: [offers[1]] });
      expect(sim.state.rules).toEqual(buildRules({ level: 2, upgrades: [offers[1]] }));
    });

    it('a click (or tap) on a card picks it; pause lists what the run has', () => {
      const t = testApp();
      const run = { ...newRun(4, 'easy'), level: 3, upgrades: ['thickSkin'] as UpgradeId[] };
      t.app.goTo('upgradePick', { run });
      t.render();
      t.idle(1);
      const { offers, cards } = pickScene(t);
      const c = cards[2];
      t.press({ click: true, aim: { x: 1, y: 1 } }); // beside the cards: nothing
      expect(t.current()).toBe('UpgradePick');
      t.press({ click: true, aim: { x: c.x + c.w / 2, y: c.y + c.h / 2 } });
      expect(playing(t).run.upgrades).toEqual(['thickSkin', offers[2]]);
      expect(playing(t).sim.state.player.hp).toBe(GAME.player.hp + 1);
      t.press({ pause: true });
      expect(t.current()).toBe('Pause');
      expect((t.scenes.current as unknown as { build: string }).build).toContain('THICK SKIN');
    });

    it('with every upgrade maxed out, NEXT goes straight to the level', () => {
      const t = testApp();
      const all = UPGRADE_IDS.flatMap((id) => Array<UpgradeId>(UPGRADES[id].maxStacks).fill(id));
      t.app.goTo('levelEnd', { run: { ...newRun(9, 'easy'), upgrades: all }, score, seconds: 30 });
      t.idle(1);
      t.choose(0);
      expect(t.current()).toBe('Play');
    });
  });

  describe('the echo of your best run (Phase 23)', () => {
    const storage = () => {
      const data = new Map<string, string>();
      vi.stubGlobal('localStorage', {
        getItem: (k: string) => data.get(k) ?? null,
        setItem: (k: string, v: string) => void data.set(k, v),
      });
    };
    type Playing = {
      sim: Simulation;
      world: { ghost: GhostTrack | null; reveal: RevealMap };
      endedAt: number | null;
      finishLevel(): void;
    };
    const playing = (t: ReturnType<typeof testApp>) => t.scenes.current as unknown as Playing;

    it('playing a map again brings back the earlier path, seen only where rings pass', () => {
      storage();
      // A bot's extraction on run seed 4, level 1, saved as that map's best.
      const sim = createSimulation({ seed: 4, level: 1 });
      const bot = new Bot(sim, 'careful');
      const recorder = new ReplayRecorder(sim, 4);
      for (let i = 0; i < 300 * 60 && sim.state.status === 'playing'; i++) {
        sim.step(bot.input(), DT);
        recorder.afterStep();
      }
      const replay = recorder.finish();
      submitGhost(ghostKey(sim.state.layout.seed), sim.state.time, pathFromReplay(replay));

      const t = testApp();
      t.app.goTo('play', { run: newRun(4, 'easy') });
      const { world } = playing(t);
      expect(world.ghost).not.toBeNull();
      for (const time of [0.5, 3, 7, 12]) {
        const was = trackPosition(replay.player, samplePointAt(replay, time));
        const ghost = world.ghost!.positionAt(time)!;
        expect(Math.hypot(ghost.x - was.x, ghost.y - was.y)).toBeLessThan(4);
      }
      // Silent darkness until a ring passes over it: then it is seen.
      t.idle(0.3);
      expect(world.reveal.objectReveal(GHOST_KEY)).toBeUndefined();
      t.press({ ping: true, pingHeld: true });
      t.press({});
      t.idle(0.2);
      expect(world.reveal.objectReveal(GHOST_KEY)).toBeDefined();
      vi.unstubAllGlobals();
    });

    it('Level End: the first extraction saves the ghost; a slower one is compared', () => {
      storage();
      const finish = (seconds: number) => {
        const t = testApp();
        t.app.goTo('play', { run: newRun(12, 'easy') });
        t.idle(0.5);
        const p = playing(t);
        p.sim.state.status = 'extracted';
        p.endedAt = seconds;
        p.finishLevel();
        expect(t.current()).toBe('LevelEnd');
        t.render();
        return (t.scenes.current as unknown as { versusBest: string }).versusBest;
      };
      expect(finish(40)).toBe('FIRST RUN ON THIS MAP: GHOST SAVED');
      expect(finish(45)).toBe('vs best: +5 s');
      expect(finish(33)).toBe('NEW BEST · −7 s · GHOST SAVED');
      vi.unstubAllGlobals();
    });
  });

  it('a level modifier (Phase 21): Blackout hides walls even on Easy; Level End names it', () => {
    const seed = Array.from({ length: 200 }, (_, i) => i + 1).find(
      (s) => levelModifier(s, 5) === 'blackout',
    )!;
    const t = testApp();
    const run = { ...newRun(seed, 'easy'), level: 5 };
    t.app.goTo('play', { run });
    const scene = t.scenes.current as unknown as {
      sim: Simulation;
      world: { ghostAlpha: number };
    };
    expect(scene.sim.state.modifier).toBe('blackout');
    expect(scene.world.ghostAlpha).toBe(0);
    t.render();
    const score = scoreRound({ ...roundResult(scene.sim.state), extracted: true });
    t.app.goTo('levelEnd', { run, score, seconds: 40 });
    expect((t.scenes.current as unknown as { modifier: string }).modifier).toBe('blackout');
    expect(score.modifier).toBeGreaterThan(0);
    t.render();
    // An unmodified level keeps the difficulty's ghost level.
    t.app.goTo('play', { run: { ...run, level: 1 } });
    expect((t.scenes.current as unknown as typeof scene).world.ghostAlpha).toBeGreaterThan(0);
  });

  it('every screen renders without errors', () => {
    const t = testApp();
    const score = {
      cores: 3,
      extraction: 500,
      timeBonus: 80,
      ghostBonus: 0,
      stuns: 1,
      closeCalls: 2,
      modifier: 0,
      total: 980,
    };
    const run = newRun(1, 'hard');
    const duelReplay = recordedDuel().replay;
    const screens: [SceneId, unknown?][] = [
      ['menu'],
      ['howToPlay'],
      ['settings'],
      ['controls'],
      ['play', { run }],
      ['pause', { upgrades: [] }],
      ['pause', { upgrades: ['quickPing', 'quickPing', 'thickSkin'] }],
      ['upgradePick', { run: { ...run, level: 2, upgrades: ['quickPing'] } }],
      ['play', { run: { ...run, level: 3, upgrades: ['softSoles', 'wideBeam'] } }],
      ['levelEnd', { run, score, seconds: 71 }],
      ['gameOver', { run, score }],
      ['replay', { replay: recordedRound() }],
      ['duelLobby'],
      ['editor', {}],
      ['duel', { series: seriesPair().host, seed: 5 }],
      ['duel', { series: seriesPair().client, seed: 5 }],
      ['duel', { practice: 'normal', seed: 5 }],
      ['duelEnd', { outcome: 'won' }],
      ['duelEnd', { outcome: 'lost', replay: duelReplay, viewerId: 1 }],
      ['duelEnd', { outcome: 'lost', replay: duelReplay, viewerId: 1, series: seriesPair().host }],
      ['duelEnd', { outcome: 'won', replay: duelReplay, viewerId: 1, practice: 'hard' }],
      ['replay', { replay: duelReplay, viewerId: 2 }],
    ];
    for (const [id, params] of screens) {
      (t.app.goTo as (id: SceneId, p?: unknown) => void)(id, params);
      t.idle(1.2);
      expect(() => t.render(), id).not.toThrow();
    }
  });
});
