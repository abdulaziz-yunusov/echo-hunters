import { describe, expect, it } from 'vitest';
import { EMPTY_INPUT } from '@/input/inputFrame';
import type { Scene } from '@/scenes/scene';
import { SceneManager } from '@/scenes/sceneManager';

const ctx = {} as CanvasRenderingContext2D;

function fakeScene(name: string, log: string[], opts: Partial<Scene> = {}): Scene {
  return {
    name,
    enter: () => log.push(`${name}.enter`),
    exit: () => log.push(`${name}.exit`),
    update: () => log.push(`${name}.update`),
    render: () => log.push(`${name}.render`),
    ...opts,
  };
}

describe('SceneManager', () => {
  it('switchTo exits every scene and enters the new one', () => {
    const log: string[] = [];
    const m = new SceneManager();
    m.switchTo(fakeScene('a', log));
    m.push(fakeScene('b', log));
    m.switchTo(fakeScene('c', log));
    expect(log).toEqual(['a.enter', 'b.enter', 'b.exit', 'a.exit', 'c.enter']);
    expect(m.depth).toBe(1);
    expect(m.current?.name).toBe('c');
  });

  it('only the top scene updates', () => {
    const log: string[] = [];
    const m = new SceneManager();
    m.switchTo(fakeScene('game', log));
    m.push(fakeScene('pause', log));
    log.length = 0;
    m.update(1 / 60, EMPTY_INPUT);
    expect(log).toEqual(['pause.update']);
  });

  it('pop resumes the scene below', () => {
    const log: string[] = [];
    const m = new SceneManager();
    m.switchTo(fakeScene('game', log));
    m.push(fakeScene('pause', log));
    m.pop();
    expect(m.current?.name).toBe('game');
  });

  it('an overlay draws the scene below it first; an opaque scene hides it', () => {
    const log: string[] = [];
    const m = new SceneManager();
    m.switchTo(fakeScene('game', log));
    m.push(fakeScene('pause', log, { overlay: true }));
    log.length = 0;
    m.render(ctx, 0);
    expect(log).toEqual(['game.render', 'pause.render']);

    m.push(fakeScene('settings', log));
    log.length = 0;
    m.render(ctx, 0);
    expect(log).toEqual(['settings.render']);
  });

  it('a switch requested during update applies after that update', () => {
    const log: string[] = [];
    const m = new SceneManager();
    const next = fakeScene('next', log);
    m.switchTo(
      fakeScene('first', log, {
        update: () => {
          m.switchTo(next);
          log.push('first.update-end');
        },
      }),
    );
    log.length = 0;
    m.update(1 / 60, EMPTY_INPUT);
    expect(log).toEqual(['first.update-end', 'first.exit', 'next.enter']);
    expect(m.current).toBe(next);
  });
});
