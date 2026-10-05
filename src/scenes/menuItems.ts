import type { Replay } from '@/replay/replay';
import type { MenuItem } from '@/ui/menuList';
import type { AppContext } from './scene';
import { newRun, type RunState } from './run';

/** "REPLAY" for end-of-round menus: opens the replay on top, Esc comes back. None without a recording. */
export function replayItem(app: AppContext, replay: Replay | undefined): MenuItem[] {
  if (!replay) return [];
  return [{ kind: 'action', label: 'REPLAY', onSelect: () => app.open('replay', { replay }) }];
}

/** A hand-made map's run is over (Phase 13): play it again, or back to the editor. */
export function customMapItems(app: AppContext, run: RunState): MenuItem[] {
  const map = run.custom!;
  return [
    {
      kind: 'action',
      label: 'PLAY AGAIN',
      onSelect: () => app.goTo('play', { run: newRun(run.seed, run.difficulty, { custom: map }) }),
    },
    { kind: 'action', label: 'EDIT MAP', onSelect: () => app.goTo('editor', { map }) },
  ];
}
