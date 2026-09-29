import { GameOverScene } from './gameOverScene';
import { LevelEndScene } from './levelEndScene';
import { MenuScene } from './menuScene';
import { PlayScene } from './playScene';
import type { AppContext, Scene, SceneArgs, SceneId } from './scene';

type SceneFactory<K extends SceneId> = (app: AppContext, ...args: SceneArgs<K>) => Scene;

/** The one place that knows every scene class. Scenes navigate by id through AppContext.goTo. */
const FACTORIES: { [K in SceneId]: SceneFactory<K> } = {
  menu: (app) => new MenuScene(app),
  play: (app, params) => new PlayScene(app, params),
  levelEnd: (app, params) => new LevelEndScene(app, params),
  gameOver: (app, params) => new GameOverScene(app, params),
};

export function createScene<K extends SceneId>(
  app: AppContext,
  id: K,
  ...args: SceneArgs<K>
): Scene {
  // TypeScript cannot relate FACTORIES[K] to K on its own.
  const factory = FACTORIES[id] as SceneFactory<K>;
  return factory(app, ...args);
}
