import { TOUCH } from '@/config/touch';
import { THEME } from '@/config/theme';
import type { TouchControls } from '@/input/touch';
import { drawText } from './text';

/**
 * The on-screen controls (Phase 12): the joystick where the finger put it
 * (or a faint hint of where to put it), and the buttons, brighter while
 * held. Outlines only, so the dark world shows through.
 */
export function drawTouchControls(
  ctx: CanvasRenderingContext2D,
  touch: TouchControls,
  height: number,
): void {
  if (!touch.currentMode) return;
  const { cyan, white } = THEME.colors;
  const { joystick } = TOUCH;
  ctx.save();
  ctx.lineWidth = 2;

  const stick = touch.stick;
  const base = stick
    ? { x: stick.originX, y: stick.originY }
    : { x: joystick.restLeft, y: height - joystick.restBottom };
  ctx.globalAlpha = stick ? 0.35 : 0.15;
  ctx.strokeStyle = white;
  ctx.beginPath();
  ctx.arc(base.x, base.y, joystick.radius, 0, Math.PI * 2);
  ctx.stroke();
  // The sneak ring: a push inside it is silent.
  ctx.setLineDash([3, 5]);
  ctx.beginPath();
  ctx.arc(base.x, base.y, joystick.radius * joystick.sneakBelow, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  const knob = stick ? { x: stick.knobX, y: stick.knobY } : base;
  ctx.globalAlpha = stick ? 0.7 : 0.25;
  ctx.fillStyle = touch.movement?.sneak ? cyan : white;
  ctx.beginPath();
  ctx.arc(knob.x, knob.y, 18, 0, Math.PI * 2);
  ctx.fill();

  const pressed = touch.pressedButtons;
  for (const b of touch.buttons()) {
    const down = pressed.has(b.id);
    ctx.globalAlpha = down ? 0.75 : 0.35;
    ctx.strokeStyle = down ? cyan : white;
    ctx.fillStyle = cyan;
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2);
    ctx.stroke();
    if (down) {
      ctx.globalAlpha = 0.18;
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    drawText(ctx, b.label, b.x, b.y + 4, {
      size: b.radius > 30 ? 12 : 10,
      color: down ? cyan : white,
      align: 'center',
      alpha: down ? 0.95 : 0.6,
    });
  }
  ctx.restore();
}
