import './style.css';
import { THEME } from '@/config/theme';

// Phase 0 bootstrap: prove the toolchain works. Replaced by the SceneManager in Phase 1.
const canvas = document.querySelector<HTMLCanvasElement>('#game');
if (!canvas) throw new Error('Canvas #game not found');
const ctx = canvas.getContext('2d');
if (!ctx) throw new Error('2D context not available');

const draw = (): void => {
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  ctx.fillStyle = THEME.background;
  ctx.fillRect(0, 0, w, h);

  ctx.font = `24px ${THEME.font}`;
  ctx.textAlign = 'center';
  ctx.fillStyle = THEME.colors.cyan;
  ctx.shadowColor = THEME.colors.cyan;
  ctx.shadowBlur = THEME.glowBlur;
  ctx.fillText('PULSE', w / 2, h / 2);
};

window.addEventListener('resize', draw);
draw();
