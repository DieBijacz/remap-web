export enum GameState {
  MENU = 'menu',
  GAME = 'game',
  SETTINGS = 'settings'
}

export class GameStateManager {
  private currentState: GameState = GameState.MENU;
  private screens: Map<GameState, HTMLElement>;

  constructor() {
    this.screens = new Map([
      [GameState.MENU, document.getElementById('menu') as HTMLElement],
      [GameState.GAME, document.getElementById('game-container') as HTMLElement],
      [GameState.SETTINGS, document.getElementById('settings') as HTMLElement]
    ]);

    // Debug: log which screen elements were found
    console.log('[debug] GameStateManager init, elements:', {
      menu: this.screens.get(GameState.MENU),
      game: this.screens.get(GameState.GAME),
      settings: this.screens.get(GameState.SETTINGS)
    });

    this.showScreen(this.currentState);
    this.setupEventListeners();
  }

  private showScreen(state: GameState) {
    // Hide all screens
    this.screens.forEach(screen => {
      screen.classList.remove('active');
    });

    // Show the requested screen
    const screen = this.screens.get(state);
    if (screen) {
      screen.classList.add('active');
    } else {
      console.warn('[debug] showScreen: no element for state', state);
    }

    console.log('[debug] showScreen ->', state, 'active=', !!screen);

    this.currentState = state;
  }

  private setupEventListeners() {
    const startButton = document.getElementById('start-game');
    const settingsButton = document.getElementById('open-settings');
    const backButton = document.getElementById('close-settings');

    startButton?.addEventListener('click', () => this.showScreen(GameState.GAME));
    settingsButton?.addEventListener('click', () => this.showScreen(GameState.SETTINGS));
    backButton?.addEventListener('click', () => this.showScreen(GameState.MENU));
  }

  getCurrentState() {
    return this.currentState;
  }

  showState(state: GameState) {
    this.showScreen(state);
  }
}