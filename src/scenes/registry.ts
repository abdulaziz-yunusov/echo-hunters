import { ControlsScene } from './controlsScene';
import { DuelEndScene } from './duelEndScene';
import { DuelLobbyScene } from './duelLobbyScene';
import { DuelScene } from './duelScene';
import { GameOverScene } from './gameOverScene';
import { HowToPlayScene } from './howToPlayScene';
import { LevelEndScene } from './levelEndScene';
import { MenuScene } from './menuScene';
import { PauseScene } from './pauseScene';
import { PlayScene } from './playScene';
import { ReplayScene } from './replayScene';
import type { AppContext, Scene, SceneArgs, SceneId } from './scene';
import { SettingsScene } from './settingsScene';

type SceneFactory<K extends SceneId> = (app: AppContext, ...args: SceneArgs<K>) => Scene;

/** The one place that knows every scene class. Scenes navigate by id through AppContext.goTo. */
const FACTORIES: { [K in SceneId]: SceneFactory<K> } = {
  menu: (app) => new MenuScene(app),
  play: (app, params) => new PlayScene(app, params),
  levelEnd: (app, params) => new LevelEndScene(app, params),
  gameOver: (app, params) => new GameOverScene(app, params),
  howToPlay: (app) => new HowToPlayScene(app),
  settings: (app) => new SettingsScene(app),
  controls: (app) => new ControlsScene(app),
  pause: (app) => new PauseScene(app),
  replay: (app, params) => new ReplayScene(app, params),
  duelLobby: (app) => new DuelLobbyScene(app),
  duel: (app, params) => new DuelScene(app, params),
  duelEnd: (app, params) => new DuelEndScene(app, params),
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
