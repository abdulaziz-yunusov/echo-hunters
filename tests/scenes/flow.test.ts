import { describe, expect, it } from 'vitest';
import type { AudioEngine } from '@/audio/audioEngine';
import type { SoundOutput } from '@/audio/soundOutput';
import { AUDIO } from '@/config/audio';
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
import { ROW_HEIGHT } from '@/ui/menuList';

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
    t.choose(3); // PLAY, DIFFICULTY, HOW TO PLAY, SETTINGS (DUEL is skipped)
    expect(t.current()).toBe('Settings');
    t.choose(4); // CONTROLS
    expect(t.current()).toBe('Controls');
    t.press({ back: true });
    expect(t.current()).toBe('Settings');
    t.press({ back: true });
    expect(t.current()).toBe('Menu');
  });

  it('menu → how to play → back, by clicking', () => {
    const t = testApp();
    t.app.goTo('menu');
    t.choose(2);
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
    const score = { cores: 0, extraction: 0, timeBonus: 0, ghostBonus: 0, stuns: 0, total: 0 };
    t.app.goTo('gameOver', { run: newRun(1, 'easy'), score });
    t.idle(1);
    t.render(); // menus place their rows when drawn
    t.press({ aim: { x: 640, y: 360 + 96 + ROW_HEIGHT } }); // hover MAIN MENU
    t.press({ click: true, confirm: true, aim: { x: 640, y: 360 + 96 + ROW_HEIGHT } });
    expect(t.current()).toBe('Menu');
  });

  it('every screen renders without errors', () => {
    const t = testApp();
    const score = { cores: 3, extraction: 500, timeBonus: 80, ghostBonus: 0, stuns: 1, total: 930 };
    const run = newRun(1, 'hard');
    const screens: [SceneId, unknown?][] = [
      ['menu'],
      ['howToPlay'],
      ['settings'],
      ['controls'],
      ['play', { run }],
      ['pause'],
      ['levelEnd', { run, score, seconds: 71 }],
      ['gameOver', { run, score }],
    ];
    for (const [id, params] of screens) {
      (t.app.goTo as (id: SceneId, p?: unknown) => void)(id, params);
      t.idle(1.2);
      expect(() => t.render(), id).not.toThrow();
    }
  });
});
