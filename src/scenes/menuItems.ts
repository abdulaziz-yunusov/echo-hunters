import type { Replay } from '@/replay/replay';
import type { MenuItem } from '@/ui/menuList';
import type { AppContext } from './scene';

/** "REPLAY" for end-of-round menus: opens the replay on top, Esc comes back. None without a recording. */
export function replayItem(app: AppContext, replay: Replay | undefined): MenuItem[] {
  if (!replay) return [];
  return [{ kind: 'action', label: 'REPLAY', onSelect: () => app.open('replay', { replay }) }];
}
