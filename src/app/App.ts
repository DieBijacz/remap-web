import { Game, type GameCompletionSummary } from '../game/Game';
import { GameState, GameStateManager } from '../core/GameStateManager';
import InputRouter from '../input/InputRouter';
import type { Action } from '../input/Keymap';
import ConfigStore, { type Config as PersistentConfig } from '../storage/ConfigStore';
import { LeaderboardScreen, type LeaderboardScreenData } from '../ui/leaderboard/LeaderboardScreen';
import { SettingsScreen } from '../ui/settings/SettingsScreen';
import { sanitizeSymbolColors } from '../config/colorPresets';

type Difficulty = 'easy' | 'medium' | 'hard' | 'progressive';

const DIFFICULTY_PRESETS: Record<Difficulty, { mechanicInterval: number; memoryPreviewDuration: number }> = {
  easy: { mechanicInterval: 18, memoryPreviewDuration: 2 },
  medium: { mechanicInterval: 14, memoryPreviewDuration: 1.6 },
  hard: { mechanicInterval: 10, memoryPreviewDuration: 1.2 },
  progressive: { mechanicInterval: 12, memoryPreviewDuration: 1.4 }
};

const clampNumber = (value: number, min: number, max: number, decimals = 2) => {
  const clamped = Math.max(min, Math.min(max, value));
  const factor = Math.pow(10, decimals);
  return Math.round(clamped * factor) / factor;
};

const normalizeDifficulty = (value: string | undefined): Difficulty => {
  if (value === 'easy' || value === 'medium' || value === 'hard' || value === 'progressive') {
    return value;
  }
  return 'easy';
};

export class App {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly stateManager = new GameStateManager();
  private readonly configStore = new ConfigStore();
  private readonly game: Game;
  private readonly leaderboardScreen: LeaderboardScreen;
  private readonly settingsScreen: SettingsScreen;
  private readonly inputRouter: InputRouter;

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
    this.game.enterAttractMode();
    this.stateManager.showState(GameState.MENU);
  }

  private initializeSettings(): PersistentConfig {
    const raw = this.configStore.load() as PersistentConfig & {
      particlesEnabled?: boolean;
      scoreRayEnabled?: boolean;
    };
    const { particlesEnabled, scoreRayEnabled, ...rest } = raw;
    const persistedConfig: PersistentConfig = rest;

    const difficulty = normalizeDifficulty(persistedConfig.difficulty);
    const intervalMap = this.normalizeIntervalMap(persistedConfig.mechanicIntervalByDifficulty);
    const memoryMap = this.normalizeMemoryPreviewMap(persistedConfig.memoryPreviewByDifficulty);
    const resolvedMechanicInterval = clampNumber(
      persistedConfig.mechanicInterval ?? intervalMap[difficulty] ?? DIFFICULTY_PRESETS[difficulty].mechanicInterval,
      1,
      60,
      0
    );
    intervalMap[difficulty] = resolvedMechanicInterval;
    const resolvedMemoryPreview = clampNumber(
      persistedConfig.memoryPreviewDuration ??
        memoryMap[difficulty] ??
        DIFFICULTY_PRESETS[difficulty].memoryPreviewDuration,
      0.2,
      6
    );
    memoryMap[difficulty] = resolvedMemoryPreview;
    const persistedParticlesPerScore = particlesEnabled === false ? 0 : persistedConfig.particlesPerScore ?? 4;
    const persistedScoreRayCount = scoreRayEnabled === false ? 0 : persistedConfig.scoreRayCount ?? 3;
    const persistedSymbolTheme = persistedConfig.symbolTheme === 'pacman' ? 'pacman' : 'classic';
    const nameEntryModeDefault = persistedConfig.nameEntryMode === 'keyboard' ? 'keyboard' : 'slots';
    const symbolColorSetting = sanitizeSymbolColors(persistedConfig.symbolColors);

    const settingsValues: PersistentConfig = {
      ...persistedConfig,
      initialTime: persistedConfig.initialTime ?? 60,
      maxTimeBonus: persistedConfig.maxTimeBonus ?? 3,
      timeBonusMode: persistedConfig.timeBonusMode ?? 'classic',
      bonusWindow: persistedConfig.bonusWindow ?? 2.5,
      ringRadiusFactor: persistedConfig.ringRadiusFactor ?? 0.15,
      menuSymbolCount: persistedConfig.menuSymbolCount ?? 24,
      menuSymbolBaseSizeVW: persistedConfig.menuSymbolBaseSizeVW ?? 6,
      menuSymbolSizeVariancePct: persistedConfig.menuSymbolSizeVariancePct ?? 30,
      menuSymbolGrowthMultiplier: persistedConfig.menuSymbolGrowthMultiplier ?? 4.5,
      menuSymbolSpeedMultiplier: persistedConfig.menuSymbolSpeedMultiplier ?? 1,
      minTimeBonus: persistedConfig.minTimeBonus ?? 0.5,
      mechanicInterval: resolvedMechanicInterval,
      mechanicIntervalByDifficulty: intervalMap,
      mechanicRandomize: persistedConfig.mechanicRandomize ?? false,
      memoryPreviewDuration: resolvedMemoryPreview,
      memoryPreviewByDifficulty: memoryMap,
      difficulty,
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
        this.game.enterAttractMode();
        break;
      case GameState.SETTINGS:
        this.settingsScreen.setValues(this.settingsValues);
        this.settingsScreen.enter();
        break;
      case GameState.GAME:
        break;
      case GameState.LEADERBOARD:
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
      const handled = this.game.handleAttractClick(x, y, {
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
      const handled = this.game.handleAttractAction(action, {
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
    if (fromState === GameState.GAME) {
      // Forfeit the active run before opening options so progress isn't saved.
      this.game.enterAttractMode();
      this.settingsReturnState = GameState.MENU;
    } else {
      this.settingsReturnState = fromState;
    }
    this.game.halt();
    this.stateManager.showState(GameState.SETTINGS);
  }

  private exitSettings() {
    if (this.stateManager.getCurrentState() !== GameState.SETTINGS) {
      this.settingsReturnState = null;
      return;
    }
    const nextState = this.settingsReturnState ?? GameState.MENU;
    this.settingsReturnState = null;
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
    const resolved = this.resolveDifficultyLinkedSettings(values);
    this.settingsValues = { ...resolved };
    this.configStore.save(this.settingsValues);
    this.game.refreshSettings(this.settingsValues);
    this.settingsScreen.setValues(this.settingsValues, { preserveSelection: true });
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

  private resolveDifficultyLinkedSettings(values: PersistentConfig): PersistentConfig {
    const previousDifficulty = normalizeDifficulty(this.settingsValues?.difficulty);
    const difficulty = normalizeDifficulty(values.difficulty ?? previousDifficulty);
    const intervalMap = this.normalizeIntervalMap(
      values.mechanicIntervalByDifficulty ?? this.settingsValues?.mechanicIntervalByDifficulty
    );
    const memoryMap = this.normalizeMemoryPreviewMap(
      values.memoryPreviewByDifficulty ?? this.settingsValues?.memoryPreviewByDifficulty
    );

    const intervalChanged = typeof values.mechanicInterval === 'number' && values.mechanicInterval !== this.settingsValues?.mechanicInterval;
    let mechanicInterval: number;
    if (difficulty !== previousDifficulty) {
      const preset = DIFFICULTY_PRESETS[difficulty].mechanicInterval;
      const stored = values.mechanicIntervalByDifficulty?.[difficulty] ?? intervalMap[difficulty];
      mechanicInterval = clampNumber(stored ?? preset, 1, 60, 0);
    } else if (intervalChanged) {
      mechanicInterval = clampNumber(values.mechanicInterval ?? intervalMap[difficulty], 1, 60, 0);
    } else {
      const fallback = values.mechanicInterval ?? intervalMap[difficulty] ?? DIFFICULTY_PRESETS[difficulty].mechanicInterval;
      mechanicInterval = clampNumber(fallback, 1, 60, 0);
    }
    intervalMap[difficulty] = mechanicInterval;

    const memoryChanged =
      typeof values.memoryPreviewDuration === 'number' &&
      values.memoryPreviewDuration !== this.settingsValues?.memoryPreviewDuration;
    let memoryPreviewDuration: number;
    if (difficulty !== previousDifficulty) {
      const preset = DIFFICULTY_PRESETS[difficulty].memoryPreviewDuration;
      const stored = values.memoryPreviewByDifficulty?.[difficulty] ?? memoryMap[difficulty];
      memoryPreviewDuration = clampNumber(stored ?? preset, 0.2, 6);
    } else if (memoryChanged) {
      memoryPreviewDuration = clampNumber(
        values.memoryPreviewDuration ?? memoryMap[difficulty],
        0.2,
        6
      );
    } else {
      const fallback =
        values.memoryPreviewDuration ??
        memoryMap[difficulty] ??
        DIFFICULTY_PRESETS[difficulty].memoryPreviewDuration;
      memoryPreviewDuration = clampNumber(fallback, 0.2, 6);
    }
    memoryMap[difficulty] = memoryPreviewDuration;

    return {
      ...values,
      difficulty,
      mechanicInterval,
      mechanicIntervalByDifficulty: intervalMap,
      memoryPreviewDuration,
      memoryPreviewByDifficulty: memoryMap
    };
  }

  private normalizeIntervalMap(
    map?: PersistentConfig['mechanicIntervalByDifficulty']
  ): Record<Difficulty, number> {
    const base: Record<Difficulty, number> = {
      easy: DIFFICULTY_PRESETS.easy.mechanicInterval,
      medium: DIFFICULTY_PRESETS.medium.mechanicInterval,
      hard: DIFFICULTY_PRESETS.hard.mechanicInterval,
      progressive: DIFFICULTY_PRESETS.progressive.mechanicInterval
    };
    if (!map) return base;
    (Object.keys(map) as Difficulty[]).forEach((key) => {
      const value = map[key];
      if (typeof value === 'number' && Number.isFinite(value)) {
        base[key] = clampNumber(value, 1, 60, 0);
      }
    });
    return base;
  }

  private normalizeMemoryPreviewMap(
    map?: PersistentConfig['memoryPreviewByDifficulty']
  ): Record<Difficulty, number> {
    const base: Record<Difficulty, number> = {
      easy: DIFFICULTY_PRESETS.easy.memoryPreviewDuration,
      medium: DIFFICULTY_PRESETS.medium.memoryPreviewDuration,
      hard: DIFFICULTY_PRESETS.hard.memoryPreviewDuration,
      progressive: DIFFICULTY_PRESETS.progressive.memoryPreviewDuration
    };
    if (!map) return base;
    (Object.keys(map) as Difficulty[]).forEach((key) => {
      const value = map[key];
      if (typeof value === 'number' && Number.isFinite(value)) {
        base[key] = clampNumber(value, 0.2, 6);
      }
    });
    return base;
  }

}

export function createApp(canvas: HTMLCanvasElement) {
  const app = new App(canvas);
  return {
    start: () => app.start()
  };
}



