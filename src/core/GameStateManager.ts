export const GameState = {
  MENU: 'menu',
  GAME: 'game',
  SETTINGS: 'settings',
  LEADERBOARD: 'leaderboard'
} as const;

export type GameState = typeof GameState[keyof typeof GameState];

export class GameStateManager {
  private currentState: GameState = GameState.MENU;
  private listeners: Array<(s: GameState) => void> = [];

  constructor() {
    // start in MENU state
    this.currentState = GameState.MENU;
    console.log('[debug] GameStateManager init, state=', this.currentState);
  }

  getCurrentState() {
    return this.currentState;
  }

  showState(state: GameState) {
    if (this.currentState === state) return;
    this.currentState = state;
    this.emit(state);
    console.log('[debug] GameStateManager showState ->', state);
  }

  onChange(cb: (s: GameState) => void) {
    this.listeners.push(cb);
    return () => { this.listeners = this.listeners.filter(l => l !== cb); };
  }

  private emit(state: GameState) {
    for (const cb of this.listeners) cb(state);
  }
}
