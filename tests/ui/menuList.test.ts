import { describe, expect, it, vi } from 'vitest';
import { EMPTY_INPUT, type InputFrame } from '@/input/inputFrame';
import { levelBar, MenuList, ROW_HEIGHT, type MenuItem } from '@/ui/menuList';

const frame = (f: Partial<InputFrame>): InputFrame => ({ ...EMPTY_INPUT, ...f });

function setup() {
  const play = vi.fn();
  const change = vi.fn();
  const items: MenuItem[] = [
    { kind: 'action', label: 'PLAY', onSelect: play },
    { kind: 'action', label: 'DUEL', onSelect: vi.fn(), disabled: true, note: 'SOON' },
    { kind: 'adjust', label: 'VOLUME', value: () => '50%', onChange: change },
  ];
  const menu = new MenuList(items);
  // Rows 300 px wide centered on x=400; row i is centered at y = 100 + i * ROW_HEIGHT.
  menu.layout(400, 100, 300);
  return { menu, play, change };
}

describe('MenuList', () => {
  it('moves with up/down, skipping disabled rows and wrapping around', () => {
    const { menu } = setup();
    expect(menu.selected).toBe(0);
    menu.update(frame({ navY: 1 }));
    expect(menu.selected).toBe(2); // DUEL is skipped
    menu.update(frame({ navY: 1 }));
    expect(menu.selected).toBe(0); // wraps
    menu.update(frame({ navY: -1 }));
    expect(menu.selected).toBe(2);
  });

  it('Enter selects; left/right adjust', () => {
    const { menu, play, change } = setup();
    menu.update(frame({ confirm: true }));
    expect(play).toHaveBeenCalledOnce();
    menu.update(frame({ navY: -1 }));
    menu.update(frame({ navX: -1 }));
    expect(change).toHaveBeenCalledWith(-1);
  });

  it('hovering selects the row under the pointer', () => {
    const { menu } = setup();
    menu.update(frame({ aim: { x: 400, y: 100 + 2 * ROW_HEIGHT } }));
    expect(menu.selected).toBe(2);
  });

  it('clicking a row chooses it; clicking an arrow adjusts that way', () => {
    const { menu, play, change } = setup();
    menu.update(frame({ click: true, confirm: true, aim: { x: 400, y: 100 } }));
    expect(play).toHaveBeenCalledOnce();

    const y = 100 + 2 * ROW_HEIGHT;
    menu.update(frame({ click: true, confirm: true, aim: { x: 260, y } }));
    expect(change).toHaveBeenLastCalledWith(-1);
    menu.update(frame({ click: true, confirm: true, aim: { x: 540, y } }));
    expect(change).toHaveBeenLastCalledWith(1);
  });

  it('a click on nothing, or on a disabled row, does nothing', () => {
    const { menu, play } = setup();
    menu.update(frame({ click: true, confirm: true, aim: { x: 5, y: 5 } }));
    menu.update(frame({ click: true, confirm: true, aim: { x: 400, y: 100 + ROW_HEIGHT } }));
    expect(play).not.toHaveBeenCalled();
    expect(menu.selected).toBe(0);
  });

  it('draws values as a level bar', () => {
    expect(levelBar(0.5)).toBe('▓▓▓▓▓░░░░░ 50%');
    expect(levelBar(1, 4)).toBe('▓▓▓▓ 100%');
  });
});
