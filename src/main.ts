import './styles/ui.scss';
import { createApp } from './app/App';

const canvas = document.getElementById('game') as HTMLCanvasElement | null;
if (!canvas) {
  throw new Error('Canvas element not found');
}

createApp(canvas).start();
