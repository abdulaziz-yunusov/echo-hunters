import './style.css';
import { startApp } from './app';

const canvas = document.querySelector<HTMLCanvasElement>('#game');
if (!canvas) throw new Error('Canvas #game not found');
startApp(canvas);
