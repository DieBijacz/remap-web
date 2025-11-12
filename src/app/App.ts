import { Game, type GameCompletionSummary } from '../game/Game';
import { GameState, GameStateManager } from '../core/GameStateManager';
import InputRouter from '../input/InputRouter';
import type { Action } from '../input/Keymap';
import ConfigStore, { type Config as PersistentConfig } from '../storage/ConfigStore';
import { MenuScreen } from '../ui/menu/MenuScreen';
import { LeaderboardScreen, type LeaderboardScreenData } from '../ui/leaderboard/LeaderboardScreen';
import { SettingsScreen } from '../ui/settings/SettingsScreen';
import { clearCanvas } from '../ui/canvasUtils';
import { sanitizeSymbolColors } from '../config/colorPresets';

export class App {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly stateManager = new GameStateManager();
  private readonly configStore = new ConfigStore();
  private readonly game: Game;
  private readonly menuScreen: MenuScreen;
  private readonly leaderboardScreen: LeaderboardScreen;
  private readonly settingsScreen: SettingsScreen;
  private readonly inputRouter: InputRouter;
  private settingsPausedGame = false;

  private settingsValues: PersistentConfig;
  private leaderboardData: LeaderboardScreenData = {
    entries: [],
    highlightIndex: null,
    finalScore: 0,
    playerName: null,
    fromGame: false,
    didQualify: false
  };
  private settingsReturnState: GameState | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Failed to acquire 2D rendering context');
    }
    this.ctx = ctx;

    this.settingsValues = this.initializeSettings();

    this.game = new Game(canvas);
    this.game.refreshSettings(this.settingsValues);

    this.menuScreen = new MenuScreen(canvas, ctx);
    this.menuScreen.setConfig(this.settingsValues);
    this.leaderboardScreen = new LeaderboardScreen(canvas, ctx);
    this.settingsScreen = new SettingsScreen({
      canvas,
      ctx,
      initialValues: this.settingsValues,
      onChange: (values) => this.handleSettingsChange(values),
      onResetHighscore: () => this.handleResetHighscore()
    });

    this.inputRouter = new InputRouter((action, event) => this.handleAction(action, event));
    window.addEventListener('beforeunload', () => this.inputRouter.destroy());

    this.attachGameHandlers();
    this.attachInputHandlers();
    this.stateManager.onChange((state) => this.handleStateChange(state));
  }

  start() {
    this.stateManager.showState(GameState.MENU);
    this.menuScreen.enter();
  }

  private initializeSettings(): PersistentConfig {
    const raw = this.configStore.load() as PersistentConfig & {
      particlesEnabled?: boolean;
      scoreRayEnabled?: boolean;
    };
    const { particlesEnabled, scoreRayEnabled, ...rest } = raw;
    const persistedConfig: PersistentConfig = rest;

    const persistedMemoryPreview = persistedConfig.memoryPreviewDuration ?? 1;
    const persistedParticlesPerScore = particlesEnabled === false ? 0 : persistedConfig.particlesPerScore ?? 4;
    const persistedScoreRayCount = scoreRayEnabled === false ? 0 : persistedConfig.scoreRayCount ?? 3;
    const persistedSymbolTheme = persistedConfig.symbolTheme === 'pacman' ? 'pacman' : 'classic';
    const nameEntryModeDefault = persistedConfig.nameEntryMode === 'keyboard' ? 'keyboard' : 'slots';
    const symbolColorSetting = sanitizeSymbolColors(persistedConfig.symbolColors);

    const settingsValues: PersistentConfig = {
      ...persistedConfig,
      initialTime: persistedConfig.initialTime ?? 60,
      maxTimeBonus: persistedConfig.maxTimeBonus ?? 3,
      bonusWindow: persistedConfig.bonusWindow ?? 2.5,
      ringRadiusFactor: persistedConfig.ringRadiusFactor ?? 0.15,
      menuSymbolCount: persistedConfig.menuSymbolCount ?? 24,
      menuSymbolBaseSizeVW: persistedConfig.menuSymbolBaseSizeVW ?? 6,
      menuSymbolSizeVariancePct: persistedConfig.menuSymbolSizeVariancePct ?? 30,
      menuSymbolGrowthMultiplier: persistedConfig.menuSymbolGrowthMultiplier ?? 4.5,
      minTimeBonus: persistedConfig.minTimeBonus ?? 0.5,
      mechanicInterval: persistedConfig.mechanicInterval ?? 10,
      mechanicRandomize: persistedConfig.mechanicRandomize ?? false,
      memoryPreviewDuration: persistedMemoryPreview,
      difficulty: persistedConfig.difficulty ?? 'medium',
      symbolScale: persistedConfig.symbolScale ?? 1,
      symbolStroke: persistedConfig.symbolStroke ?? 1,
      symbolTheme: persistedSymbolTheme,
      symbolColors: symbolColorSetting,
      uiFontScale: persistedConfig.uiFontScale ?? 0.9,
      particlesPerScore: persistedParticlesPerScore,
      particlesPersist: persistedConfig.particlesPersist ?? false,
      scoreRayCount: persistedScoreRayCount,
      scoreRayThickness: persistedConfig.scoreRayThickness ?? 1,
      scoreRayIntensity: persistedConfig.scoreRayIntensity ?? 1,
      mechanicEnableRemap: persistedConfig.mechanicEnableRemap ?? true,
      mechanicEnableMemory: persistedConfig.mechanicEnableMemory ?? true,
      mechanicEnableJoystick: persistedConfig.mechanicEnableJoystick ?? true,
      mechanicEnableMatchColor: persistedConfig.mechanicEnableMatchColor ?? true,
      mechanicEnableMatchShape: persistedConfig.mechanicEnableMatchShape ?? true,
      nameEntryMode: nameEntryModeDefault
    };
    this.configStore.save(settingsValues);
    return settingsValues;
  }

  private attachGameHandlers() {
    this.game.onGameComplete((summary) => this.handleGameComplete(summary));
  }

  private attachInputHandlers() {
    this.canvas.addEventListener('click', (event) => {
      const rect = this.canvas.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      this.handleCanvasClick(x, y);
    });
  }

  private handleStateChange(state: GameState) {
    switch (state) {
      case GameState.MENU:
        this.settingsReturnState = null;
        this.menuScreen.enter();
        break;
      case GameState.SETTINGS:
        this.menuScreen.exit();
        this.settingsScreen.setValues(this.settingsValues);
        this.settingsScreen.enter();
        break;
      case GameState.GAME:
        this.menuScreen.exit();
        clearCanvas(this.canvas, this.ctx);
        break;
      case GameState.LEADERBOARD:
        this.menuScreen.exit();
        this.leaderboardScreen.setData(this.leaderboardData);
        this.leaderboardScreen.draw();
        break;
      default:
        break;
    }
  }

  private handleCanvasClick(x: number, y: number) {
    const state = this.stateManager.getCurrentState();
    if (state === GameState.MENU) {
      const handled = this.menuScreen.handleClick(x, y, {
        onStart: () => this.startGameFromMenu()
      });
      if (handled) {
        return;
      }
    } else if (state === GameState.SETTINGS) {
      const exit = this.settingsScreen.handleClick(x, y);
      if (exit) {
        this.exitSettings();
      }
    } else if (state === GameState.LEADERBOARD) {
      const exit = this.leaderboardScreen.handleClick();
      if (exit) {
        this.closeLeaderboard();
      }
    }
  }

  private handleAction(action: Action, event?: KeyboardEvent) {
    const state = this.stateManager.getCurrentState();

    if (action === 'settings') {
      if (state === GameState.SETTINGS) {
        this.exitSettings();
      } else {
        this.enterSettings(state);
      }
      event?.preventDefault();
      return;
    }

    if (state === GameState.SETTINGS) {
      const exit = this.settingsScreen.handleAction(action);
      if (exit) {
        this.exitSettings();
      }
      event?.preventDefault();
      return;
    }

    if (state === GameState.LEADERBOARD) {
      const exit = this.leaderboardScreen.handleAction(action);
      if (exit) {
        this.closeLeaderboard();
      }
      event?.preventDefault();
      return;
    }

    if (state === GameState.MENU) {
      const handled = this.menuScreen.handleAction(action, {
        onStart: () => this.startGameFromMenu()
      });
      if (handled) {
        event?.preventDefault();
      }
      return;
    }
  }

  private startGameFromMenu() {
    if (this.stateManager.getCurrentState() !== GameState.GAME) {
      this.stateManager.showState(GameState.GAME);
    }
    this.game.start();
  }

  private enterSettings(fromState: GameState) {
    if (this.stateManager.getCurrentState() === GameState.SETTINGS) {
      return;
    }
    this.settingsReturnState = fromState;
    if (fromState === GameState.GAME) {
      this.game.pauseLayer();
      this.settingsPausedGame = true;
    } else {
      this.settingsPausedGame = false;
    }
    this.stateManager.showState(GameState.SETTINGS);
  }

  private exitSettings() {
    if (this.stateManager.getCurrentState() !== GameState.SETTINGS) {
      this.settingsReturnState = null;
      this.settingsPausedGame = false;
      return;
    }
    const nextState = this.settingsReturnState ?? GameState.MENU;
    this.settingsReturnState = null;
    if (this.settingsPausedGame) {
      this.game.resumeLayer();
      this.settingsPausedGame = false;
    }
    this.stateManager.showState(nextState);
  }

  private closeLeaderboard() {
    this.leaderboardData = {
      ...this.leaderboardData,
      highlightIndex: null,
      fromGame: false,
      didQualify: false
    };
    this.stateManager.showState(GameState.MENU);
  }

  private handleSettingsChange(values: PersistentConfig) {
    this.settingsValues = { ...values };
    this.configStore.save(this.settingsValues);
    this.game.refreshSettings(this.settingsValues);
    this.menuScreen.setConfig(this.settingsValues);
  }

  private handleResetHighscore() {
    this.game.resetHighscore();
  }

  private handleGameComplete(summary: GameCompletionSummary) {
    const highlight = summary.didQualify && summary.placement != null ? summary.placement : null;
    this.leaderboardData = {
      entries: summary.leaderboard,
      highlightIndex: highlight,
      finalScore: summary.finalScore,
      playerName: summary.playerName ?? null,
      fromGame: true,
      didQualify: summary.didQualify
    };
    this.stateManager.showState(GameState.LEADERBOARD);
  }

}

export function createApp(canvas: HTMLCanvasElement) {
  const app = new App(canvas);
  return {
    start: () => app.start()
  };
}



