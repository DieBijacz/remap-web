import './styles/ui.scss';
import { Game } from './game/Game';
import { GameStateManager, GameState } from './core/GameStateManager';

// Initialize game state manager
const stateManager = new GameStateManager();

// Initialize game with canvas
const canvas = document.getElementById('game') as HTMLCanvasElement;
if (!canvas) throw new Error('Canvas element not found');

const game = new Game(canvas);

// Handle start game button click
const startButton = document.getElementById('start-game');
startButton?.addEventListener('click', () => {
  console.log('[debug] Start button clicked');
  stateManager.showState(GameState.GAME);
  game.start();
});

// Debug: log arrow key presses to help trace input issues
document.addEventListener('keydown', (e) => {
  const keys = ['ArrowUp', 'ArrowRight', 'ArrowDown', 'ArrowLeft'];
  if (keys.includes(e.key)) {
    console.log(`[debug] Keydown: ${e.key}`);
    try {
      // forward to game input handler for debugging
      (game as any).onKeyDown?.(e as KeyboardEvent);
    } catch (err) {
      console.error('[debug] forwarding key to game failed', err);
    }
  }
});
