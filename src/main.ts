import './styles/ui.scss';
import { Game, type GameCompletionSummary } from './game/Game';
import { GameStateManager, GameState } from './core/GameStateManager';
import ConfigStore from './storage/ConfigStore';
import type { Config as PersistentConfig } from './storage/ConfigStore';
import type { HighscoreEntry } from './storage/HighscoreStore';
// Initialize game state manager
const stateManager = new GameStateManager();

// Initialize game with canvas
const canvas = document.getElementById('game') as HTMLCanvasElement;
if (!canvas) throw new Error('Canvas element not found');

const ctx = canvas.getContext('2d')!;

const LEADERBOARD_LIMIT = 10;

type LeaderboardScreenData = {
  entries: HighscoreEntry[];
  highlightIndex: number | null;
  finalScore: number;
  playerName: string | null;
  fromGame: boolean;
  didQualify: boolean;
};

let leaderboardScreenData: LeaderboardScreenData = {
  entries: [],
  highlightIndex: null,
  finalScore: 0,
  playerName: null,
  fromGame: false,
  didQualify: false
};

const configStore = new ConfigStore();
const rawPersistedConfig = configStore.load() as PersistentConfig & {
  particlesEnabled?: boolean;
  scoreRayEnabled?: boolean;
};
const {
  particlesEnabled: legacyParticlesEnabled,
  scoreRayEnabled: legacyScoreRayEnabled,
  ...persistedConfigRest
} = rawPersistedConfig;
const persistedConfig: PersistentConfig = persistedConfigRest;
const persistedMemoryPreview = persistedConfig.memoryPreviewDuration ?? 1;
const persistedParticlesPerScore =
  legacyParticlesEnabled === false ? 0 : persistedConfig.particlesPerScore ?? 4;
const persistedScoreRayCount =
  legacyScoreRayEnabled === false ? 0 : persistedConfig.scoreRayCount ?? 3;
const nameEntryModeDefault =
  persistedConfig.nameEntryMode === 'keyboard' ? 'keyboard' : 'slots';
let settingsValues: PersistentConfig = {
  ...persistedConfig,
  initialTime: persistedConfig.initialTime ?? 60,
  maxTimeBonus: persistedConfig.maxTimeBonus ?? 3,
  bonusWindow: persistedConfig.bonusWindow ?? 2.5,
  ringRadiusFactor: persistedConfig.ringRadiusFactor ?? 0.15,
  minTimeBonus: persistedConfig.minTimeBonus ?? 0.5,
  mechanicInterval: persistedConfig.mechanicInterval ?? 10,
  mechanicRandomize: persistedConfig.mechanicRandomize ?? false,
  memoryPreviewDuration: persistedMemoryPreview,
  difficulty: persistedConfig.difficulty ?? 'medium',
  symbolScale: persistedConfig.symbolScale ?? 1,
  symbolStroke: persistedConfig.symbolStroke ?? 1,
  uiFontScale: persistedConfig.uiFontScale ?? 0.9,
  particlesPerScore: persistedParticlesPerScore,
  particlesPersist: persistedConfig.particlesPersist ?? false,
  scoreRayCount: persistedScoreRayCount,
  scoreRayThickness: persistedConfig.scoreRayThickness ?? 1,
  scoreRayIntensity: persistedConfig.scoreRayIntensity ?? 1,
  mechanicEnableRemap: persistedConfig.mechanicEnableRemap ?? true,
  mechanicEnableSpin: persistedConfig.mechanicEnableSpin ?? true,
  mechanicEnableMemory: persistedConfig.mechanicEnableMemory ?? true,
  mechanicEnableJoystick: persistedConfig.mechanicEnableJoystick ?? true,
  nameEntryMode: nameEntryModeDefault
};
configStore.save(settingsValues);

const game = new Game(canvas);
game.refreshSettings(settingsValues);
game.onGameComplete((summary: GameCompletionSummary) => {
  const highlight =
    summary.didQualify && summary.placement != null ? summary.placement : null;
  leaderboardScreenData = {
    entries: summary.leaderboard,
    highlightIndex: highlight,
    finalScore: summary.finalScore,
    playerName: summary.playerName ?? null,
    fromGame: true,
    didQualify: summary.didQualify
  };
  stateManager.showState(GameState.LEADERBOARD);
});

let settingsReturnState: GameState | null = null;

function enterSettings(fromState: GameState) {
  if (stateManager.getCurrentState() === GameState.SETTINGS) {
    return;
  }
  settingsReturnState = fromState;
  stateManager.showState(GameState.SETTINGS);
}

function exitSettings() {
  if (stateManager.getCurrentState() !== GameState.SETTINGS) {
    settingsReturnState = null;
    return;
  }
  const nextState = settingsReturnState ?? GameState.MENU;
  settingsReturnState = null;
  stateManager.showState(nextState);
}

type SettingItem =
  | {
      type: 'number';
      key: keyof PersistentConfig;
      label: string;
      min: number;
      max: number;
      step: number;
      format: (value: number) => string;
    }
  | {
      type: 'label';
      label: string;
    }
  | {
      type: 'toggle';
      key: keyof PersistentConfig;
      label: string;
      format?: (value: boolean) => string;
    }
  | {
      type: 'action';
      label: string;
      description?: string;
      onActivate: () => void;
    }
  | {
      type: 'cycle';
      key: keyof PersistentConfig;
      label: string;
      options: string[];
      format?: (value: string) => string;
    };
type SettingsTabKey = 'gameplay' | 'mechanics' | 'visual' | 'system';

type SettingsTab = {
  key: SettingsTabKey;
  label: string;
  items: SettingItem[];
};

const SETTINGS_TABS: SettingsTab[] = [
  {
    key: 'gameplay',
    label: 'Gameplay',
    items: [
      {
        type: 'number',
        key: 'initialTime',
        label: 'Starting Time',
        min: 20,
        max: 240,
        step: 5,
        format: (v) => `${Math.round(v)} s`
      },
      {
        type: 'number',
        key: 'maxTimeBonus',
        label: 'Max Time Bonus',
        min: 0.5,
        max: 6,
        step: 0.1,
        format: (v) => `${v.toFixed(1)} s`
      },
      {
        type: 'number',
        key: 'bonusWindow',
        label: 'Bonus Window',
        min: 0.5,
        max: 6,
        step: 0.1,
        format: (v) => `${v.toFixed(1)} s`
      },
      {
        type: 'cycle',
        key: 'difficulty',
        label: 'Difficulty',
        options: ['easy', 'medium', 'hard', 'progressive'],
        format: (value) => value.charAt(0).toUpperCase() + value.slice(1)
      }
    ]
  },
  {
    key: 'mechanics',
    label: 'Mechanics',
    items: [
      {
        type: 'number',
        key: 'mechanicInterval',
        label: 'Mechanic Interval',
        min: 3,
        max: 30,
        step: 1,
        format: (v) => `${Math.round(v)} hits`
      },
      {
        type: 'toggle',
        key: 'mechanicRandomize',
        label: 'Randomize Mechanics',
        format: (value) => (value ? 'On' : 'Off')
      },
      {
        type: 'toggle',
        key: 'mechanicEnableRemap',
        label: 'Remap Mechanic',
        format: (value) => (value ? 'On' : 'Off')
      },
      {
        type: 'toggle',
        key: 'mechanicEnableSpin',
        label: 'Spin Mechanic',
        format: (value) => (value ? 'On' : 'Off')
      },
      {
        type: 'toggle',
        key: 'mechanicEnableMemory',
        label: 'Memory Mechanic',
        format: (value) => (value ? 'On' : 'Off')
      },
      {
        type: 'number',
        key: 'memoryPreviewDuration',
        label: 'Memory Hide Delay',
        min: 0.2,
        max: 6,
        step: 0.1,
        format: (v) => `${v.toFixed(1)} s`
      },
      {
        type: 'toggle',
        key: 'mechanicEnableJoystick',
        label: 'Joystick Invert',
        format: (value) => (value ? 'On' : 'Off')
      }
    ]
  },
  {
    key: 'visual',
    label: 'Visual Effects',
    items: [
      {
        type: 'number',
        key: 'ringRadiusFactor',
        label: 'Ring Radius',
        min: 0.08,
        max: 0.26,
        step: 0.01,
        format: (v) => `${Math.round(v * 100)}% width`
      },
      {
        type: 'number',
        key: 'symbolScale',
        label: 'Symbol Size',
        min: 0.6,
        max: 1.6,
        step: 0.05,
        format: (v) => `${Math.round(v * 100)}%`
      },
      {
        type: 'number',
        key: 'symbolStroke',
        label: 'Symbol Outline',
        min: 0.5,
        max: 1.8,
        step: 0.05,
        format: (v) => `${v.toFixed(2)}x`
      },
      {
        type: 'number',
        key: 'particlesPerScore',
        label: 'Particles per Hit',
        min: 0,
        max: 20,
        step: 1,
        format: (v) => `${Math.round(v)}`
      },
      {
        type: 'toggle',
        key: 'particlesPersist',
        label: 'Keep Orbiting',
        format: (value) => (value ? 'On' : 'Off')
      },
      {
        type: 'number',
        key: 'scoreRayCount',
        label: 'Ray Lines',
        min: 0,
        max: 12,
        step: 1,
        format: (v) => `${Math.round(v)}`
      },
      {
        type: 'number',
        key: 'scoreRayThickness',
        label: 'Ray Thickness',
        min: 0.2,
        max: 3,
        step: 0.1,
        format: (v) => `${v.toFixed(1)}x`
      },
      {
        type: 'number',
        key: 'scoreRayIntensity',
        label: 'Ray Intensity',
        min: 0.3,
        max: 2.5,
        step: 0.1,
        format: (v) => `${v.toFixed(1)}x`
      }
    ]
  },
  {
    key: 'system',
    label: 'System',
    items: [
      {
        type: 'number',
        key: 'uiFontScale',
        label: 'UI Font Scale',
        min: 0.5,
        max: 1.4,
        step: 0.05,
        format: (v) => `${Math.round(v * 100)}%`
      },
      {
        type: 'cycle',
        key: 'nameEntryMode',
        label: 'Name Entry',
        options: ['slots', 'keyboard'],
        format: (value) => (value === 'keyboard' ? 'On-screen Keyboard' : 'Letter Slots')
      },
      {
        type: 'action',
        label: 'Reset Highscore',
        description: 'Press Enter to clear best score',
        onActivate: () => {
          game.resetHighscore();
          settingsMessage = 'Highscore reset';
        }
      }
    ]
  }
];

const getFirstSelectableIndex = (tabIndex: number): number => {
  const items = SETTINGS_TABS[tabIndex]?.items ?? [];
  const idx = items.findIndex((item) => item.type !== 'label');
  return idx === -1 ? 0 : idx;
};

const tabHasSelectableSettings = (tabIndex: number): boolean =>
  (SETTINGS_TABS[tabIndex]?.items ?? []).some((item) => item.type !== 'label');

let currentTabIndex: number = 0;
let settingsSelection = getFirstSelectableIndex(currentTabIndex);
let settingsMessage: string | null = null;

// Menu UI button rectangles (in CSS pixels)
let startButtonRect: DOMRect | null = null;
let leaderboardButtonRect: DOMRect | null = null;
let settingsButtonRect: DOMRect | null = null;
let backButtonRect: DOMRect | null = null;
let tabButtonRects: DOMRect[] = [];

function clearCanvas() {
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0); // reset to device pixels for clearing
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.restore();
}

function drawButton(x: number, y: number, w: number, h: number, text: string) {
  // draw rounded rect
  const radius = Math.min(12, h * 0.2);
  ctx.fillStyle = '#238636';
  roundRect(ctx, x, y, w, h, radius, true, false);
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x + w / 2, y + h / 2);
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, fill: boolean, stroke: boolean) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
  if (fill) ctx.fill();
  if (stroke) ctx.stroke();
}

function drawMenu() {
  // Use CSS pixels for layout (ctx is already set up by Renderer2D)
  const cssW = canvas.clientWidth;
  const cssH = canvas.clientHeight;

  // Clear using canvas API
  ctx.save();
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Title
  const titleSize = Math.max(36, Math.round(cssH * 0.08));
  ctx.font = `${titleSize}px Orbitron, sans-serif`;
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText('Remap', cssW / 2, cssH * 0.12);

  // Buttons
  const btnW = Math.round(cssW * 0.4);
  const btnH = Math.max(40, Math.round(cssH * 0.08));
  const btnX = Math.round((cssW - btnW) / 2);
  const startY = Math.round(cssH * 0.38);
  const leaderboardY = startY + btnH + 16;
  const settingsY = leaderboardY + btnH + 16;

  ctx.font = `${Math.max(16, Math.round(cssH * 0.04))}px Orbitron, sans-serif`;
  drawButton(btnX, startY, btnW, btnH, 'Start Game');
  drawButton(btnX, leaderboardY, btnW, btnH, 'Leaderboard');
  drawButton(btnX, settingsY, btnW, btnH, 'Settings');

  // store rects in CSS pixel coordinates
  startButtonRect = new DOMRect(btnX, startY, btnW, btnH);
  leaderboardButtonRect = new DOMRect(btnX, leaderboardY, btnW, btnH);
  settingsButtonRect = new DOMRect(btnX, settingsY, btnW, btnH);

  const hintY = settingsY + btnH + Math.max(28, Math.round(cssH * 0.05));
  ctx.font = `${Math.max(12, Math.round(cssH * 0.03))}px Orbitron, sans-serif`;
  ctx.fillStyle = 'rgba(148, 163, 184, 0.85)';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText('Press O to open options', cssW / 2, hintY);

  ctx.restore();
}

function showLeaderboardFromMenu() {
  const entries = game.getLeaderboardSnapshot();
  leaderboardScreenData = {
    entries,
    highlightIndex: null,
    finalScore: 0,
    playerName: null,
    fromGame: false,
    didQualify: false
  };
  stateManager.showState(GameState.LEADERBOARD);
}

function drawLeaderboardScreen() {
  const w = canvas.width;
  const h = canvas.height;
  ctx.save();
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#0d1117';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = 'rgba(6, 10, 18, 0.78)';
  ctx.fillRect(0, 0, w, h);
  ctx.restore();

  const rows: Array<HighscoreEntry | null> = leaderboardScreenData.entries
    .slice(0, LEADERBOARD_LIMIT)
    .map((entry) => (entry ? { ...entry } : null));
  while (rows.length < LEADERBOARD_LIMIT) {
    rows.push(null);
  }

  const hasEntries = rows.some((entry) => entry);

  const highlight =
    leaderboardScreenData.highlightIndex != null &&
    leaderboardScreenData.highlightIndex >= 0 &&
    leaderboardScreenData.highlightIndex < LEADERBOARD_LIMIT
      ? leaderboardScreenData.highlightIndex
      : null;

  const paddingX = Math.max(24, Math.round(w * 0.06));
  const paddingY = Math.max(20, Math.round(h * 0.035));
  const titleSize = Math.max(28, Math.round(h * 0.055));
  const rowHeight = Math.max(30, Math.round(h * 0.05));
  const gapAfterTitle = Math.max(18, Math.round(h * 0.024));
  const instructionsSize = Math.max(16, Math.round(h * 0.028));
  const panelWidth = Math.min(Math.round(w * 0.78), 780);

  const subtitleSize = Math.max(18, Math.round(h * 0.032));
  const subtitleGap = Math.max(12, Math.round(h * 0.018));

  const rowsHeight = rows.length * rowHeight;
  const basePanelHeight =
    paddingY * 2 + titleSize + subtitleSize + subtitleGap + gapAfterTitle + rowsHeight + gapAfterTitle + instructionsSize;

  const panelHeight = basePanelHeight;
  const panelX = (w - panelWidth) / 2;
  const panelY = Math.max(h * 0.08, (h - panelHeight) / 2);

  const drawRoundedRect = (x: number, y: number, width: number, height: number, radius: number) => {
    const rad = Math.min(radius, height / 2, width / 2);
    ctx.beginPath();
    ctx.moveTo(x + rad, y);
    ctx.lineTo(x + width - rad, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + rad);
    ctx.lineTo(x + width, y + height - rad);
    ctx.quadraticCurveTo(x + width, y + height, x + width - rad, y + height);
    ctx.lineTo(x + rad, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - rad);
    ctx.lineTo(x, y + rad);
    ctx.quadraticCurveTo(x, y, x + rad, y);
    ctx.closePath();
  };

  ctx.save();
  drawRoundedRect(panelX, panelY, panelWidth, panelHeight, Math.min(32, panelHeight * 0.08));
  ctx.fillStyle = 'rgba(12, 18, 28, 0.95)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(121, 192, 255, 0.32)';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();

  let rowY = panelY + paddingY;
  ctx.save();
  ctx.font = `${titleSize}px Orbitron, sans-serif`;
  ctx.fillStyle = '#79c0ff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText('Top Scores', w / 2, rowY);
  ctx.restore();

  rowY += titleSize + Math.max(8, Math.round(h * 0.012));

  const subtitleText = (() => {
    if (!hasEntries) {
      return 'No scores recorded yet';
    }
    if (!leaderboardScreenData.fromGame) {
      return 'Best results across all sessions';
    }
    if (leaderboardScreenData.didQualify) {
      return leaderboardScreenData.playerName
        ? `${leaderboardScreenData.playerName} joined the leaderboard!`
        : 'A new score entered the leaderboard!';
    }
    return `Final Score ${leaderboardScreenData.finalScore.toLocaleString()}`;
  })();

  ctx.save();
  ctx.font = `${subtitleSize}px Orbitron, sans-serif`;
  ctx.fillStyle = 'rgba(205, 217, 229, 0.9)';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText(subtitleText, w / 2, rowY);
  ctx.restore();

  rowY += subtitleSize + subtitleGap;

  const rankWidth = Math.max(40, Math.round(panelWidth * 0.1));
  const rowWidth = panelWidth - paddingX * 2;
  const rowFontSize = Math.max(18, Math.round(rowHeight * 0.55));

  rows.forEach((entry, index) => {
    const centerY = rowY + rowHeight / 2;
    const isHighlight = highlight === index;
    if (isHighlight) {
      ctx.save();
      drawRoundedRect(
        panelX + paddingX,
        rowY,
        rowWidth,
        rowHeight,
        Math.min(10, rowHeight * 0.35)
      );
      ctx.fillStyle = 'rgba(121, 192, 255, 0.18)';
      ctx.fill();
      ctx.restore();
    }

    ctx.save();
    ctx.font = `${rowFontSize}px Orbitron, sans-serif`;
    ctx.fillStyle = entry ? (isHighlight ? '#79c0ff' : '#e2e8f0') : 'rgba(148, 163, 184, 0.6)';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    const rankText = `${(index + 1).toString().padStart(2, '0')}.`;
    ctx.fillText(rankText, panelX + paddingX, centerY);
    const name = entry ? entry.name : '---';
    ctx.fillText(name, panelX + paddingX + rankWidth, centerY);
    ctx.textAlign = 'right';
    const scoreText = entry ? entry.score.toLocaleString() : '---';
    ctx.fillText(scoreText, panelX + paddingX + rowWidth, centerY);
    ctx.restore();

    rowY += rowHeight;
  });

  const instructions = leaderboardScreenData.fromGame
    ? 'Press Enter to continue'
    : 'Press Enter or Esc to return';
  const instructionsY = panelY + panelHeight - paddingY - instructionsSize;
  ctx.save();
  ctx.font = `${instructionsSize}px Orbitron, sans-serif`;
  ctx.fillStyle = 'rgba(205, 217, 229, 0.9)';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText(instructions, w / 2, instructionsY);
  ctx.restore();

  const showFinalScore =
    leaderboardScreenData.fromGame && !leaderboardScreenData.didQualify;
  if (showFinalScore) {
    const boxWidth = Math.min(panelWidth, w * 0.7);
    const boxHeight = Math.max(72, Math.round(h * 0.1));
    const boxX = (w - boxWidth) / 2;
    const boxY = Math.min(
      h - boxHeight - Math.max(32, h * 0.08),
      panelY + panelHeight + Math.max(32, h * 0.06)
    );
    ctx.save();
    drawRoundedRect(boxX, boxY, boxWidth, boxHeight, Math.min(24, boxHeight * 0.4));
    ctx.fillStyle = 'rgba(12, 18, 28, 0.92)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(121, 192, 255, 0.3)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.font = `${Math.max(18, Math.round(boxHeight * 0.32))}px Orbitron, sans-serif`;
    ctx.fillStyle = 'rgba(205, 217, 229, 0.82)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Final Score', w / 2, boxY + boxHeight * 0.35);
    ctx.font = `${Math.max(30, Math.round(boxHeight * 0.5))}px Orbitron, sans-serif`;
    ctx.fillStyle = '#f8fafc';
    ctx.fillText(leaderboardScreenData.finalScore.toLocaleString(), w / 2, boxY + boxHeight * 0.72);
    ctx.restore();
  }
}

function drawSettings() {
  const cssW = canvas.clientWidth;
  const cssH = canvas.clientHeight;
  ctx.save();
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const fontScale = clampNumber(settingsValues.uiFontScale ?? 1, 0.5, 1.4, 2);
  const titleSize = Math.max(16, Math.round(cssH * 0.045 * Math.max(0.75, fontScale)));
  ctx.font = `${titleSize}px Orbitron, sans-serif`;
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText('Settings', cssW / 2, cssH * 0.12);

  const marginX = Math.round(cssW * 0.12);
  const tabFontSize = Math.max(12, Math.round(cssH * 0.03 * Math.max(0.75, fontScale)));
  ctx.font = `${tabFontSize}px Orbitron, sans-serif`;
  const tabPaddingX = Math.max(28, Math.round(cssW * 0.04));
  const tabPaddingY = Math.max(12, Math.round(tabFontSize * 0.55));
  const tabSpacing = Math.max(12, Math.round(cssW * 0.02));
  const tabMetrics = SETTINGS_TABS.map((tab) => {
    const width = ctx.measureText(tab.label).width + tabPaddingX;
    const height = Math.max(tabFontSize + tabPaddingY, 34);
    return { width, height };
  });
  const tabBarHeight = tabMetrics.reduce((max, metric) => Math.max(max, metric.height), 0);
  const totalTabWidth = tabMetrics.reduce((sum, metric) => sum + metric.width, 0) + tabSpacing * (Math.max(SETTINGS_TABS.length - 1, 0));
  let tabCursorX = Math.round(Math.max(marginX * 0.6, (cssW - totalTabWidth) / 2));
  const tabCenterY = Math.round(cssH * 0.2);
  tabButtonRects = [];

  SETTINGS_TABS.forEach((tab, idx) => {
    const metric = tabMetrics[idx];
    const tabX = tabCursorX;
    const tabY = tabCenterY - metric.height / 2;
    const isActive = idx === currentTabIndex;
    const radius = Math.min(20, metric.height / 2);
    ctx.fillStyle = isActive ? 'rgba(34, 197, 94, 0.24)' : 'rgba(148, 163, 184, 0.14)';
    roundRect(ctx, tabX, tabY, metric.width, metric.height, radius, true, false);
    ctx.fillStyle = isActive ? '#7ee787' : '#94a3b8';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(tab.label, tabX + metric.width / 2, tabCenterY);
    tabButtonRects[idx] = new DOMRect(tabX, tabY, metric.width, metric.height);
    tabCursorX += metric.width + tabSpacing;
  });

  const items = SETTINGS_TABS[currentTabIndex]?.items ?? [];
  const listStartY = tabCenterY + tabBarHeight / 2 + Math.max(20, Math.round(cssH * 0.035));
  const baseSpacing = Math.max(24, Math.round(cssH * 0.052));
  const rowSpacing = Math.max(22, Math.round(baseSpacing * Math.max(0.82, fontScale)));
  const rowHeight = Math.max(18, Math.round(cssH * 0.042 * Math.max(0.85, fontScale)));
  const labelSize = Math.max(9, Math.round(cssH * 0.021 * fontScale));
  const valueSize = Math.max(11, Math.round(cssH * 0.028 * fontScale));
  ctx.textBaseline = 'middle';

  items.forEach((item, idx) => {
    const y = listStartY + idx * rowSpacing;
    const isSelected = idx === settingsSelection;
    const displayY = y + rowHeight / 2;

    if (isSelected && item.type !== 'label') {
      ctx.fillStyle = 'rgba(79, 70, 229, 0.18)';
      roundRect(ctx, marginX * 0.6, y - rowHeight * 0.2, cssW - marginX * 1.2, rowHeight, Math.min(12, rowHeight * 0.35), true, false);
    }

    ctx.textAlign = 'left';

    ctx.font = `${labelSize}px Orbitron, sans-serif`;
    ctx.fillStyle = isSelected ? '#cdd7ff' : '#9aa5be';
    ctx.fillText(item.label, marginX, displayY);

    if (item.type === 'number') {
      const raw = settingsValues[item.key] ?? 0;
      ctx.textAlign = 'right';
      ctx.font = `${valueSize}px Orbitron, sans-serif`;
      ctx.fillStyle = isSelected ? '#79c0ff' : '#cbd5f5';
      ctx.fillText(item.format(raw as number), cssW - marginX, displayY);
    } else if (item.type === 'toggle') {
      const raw = settingsValues[item.key];
      const enabled = typeof raw === 'boolean' ? raw : Boolean(raw);
      const text = item.format ? item.format(enabled) : enabled ? 'On' : 'Off';
      ctx.textAlign = 'right';
      ctx.font = `${valueSize}px Orbitron, sans-serif`;
      ctx.fillStyle = isSelected ? '#7ee787' : '#cbd5f5';
      ctx.fillText(text, cssW - marginX, displayY);
    } else if (item.type === 'cycle') {
      const raw = settingsValues[item.key];
      const fallback = item.options[0] ?? '';
      const value = typeof raw === 'string' && raw.length > 0 ? raw : fallback;
      const text = item.format ? item.format(value) : value;
      ctx.textAlign = 'right';
      ctx.font = `${valueSize}px Orbitron, sans-serif`;
      ctx.fillStyle = isSelected ? '#79c0ff' : '#cbd5f5';
      ctx.fillText(text, cssW - marginX, displayY);
    } else if (item.type === 'action') {
      ctx.textAlign = 'right';
      ctx.font = `${labelSize}px Orbitron, sans-serif`;
      ctx.fillStyle = isSelected ? '#7ee787' : '#94a3b8';
      ctx.fillText(item.description ?? 'Press Enter', cssW - marginX, displayY);
    }
  });

  if (settingsMessage) {
    ctx.textAlign = 'center';
    ctx.font = `${Math.max(12, Math.round(cssH * 0.028 * fontScale))}px Orbitron, sans-serif`;
    ctx.fillStyle = '#7ee787';
    ctx.fillText(settingsMessage, cssW / 2, cssH * 0.72);
  }

  // Back button
  const btnW = Math.round(cssW * 0.3);
  const btnH = Math.max(36, Math.round(cssH * 0.07));
  const btnX = Math.round((cssW - btnW) / 2);
  const btnY = Math.round(cssH * 0.82);

  ctx.font = `${Math.max(11, Math.round(cssH * 0.025 * fontScale))}px Orbitron, sans-serif`;
  drawButton(btnX, btnY, btnW, btnH, 'Back');
  backButtonRect = new DOMRect(btnX, btnY, btnW, btnH);

  ctx.textAlign = 'center';
  ctx.font = `${Math.max(9, Math.round(cssH * 0.02 * fontScale))}px Orbitron, sans-serif`;
  ctx.fillStyle = 'rgba(148, 163, 184, 0.9)';
  ctx.fillText('Press O to toggle options. Q/E tabs, UP/DOWN select, LEFT/RIGHT adjust, Enter confirm, Esc exit', cssW / 2, btnY - Math.max(24, Math.round(cssH * 0.06)));
  ctx.restore();
}

function selectTab(index: number) {
  if (SETTINGS_TABS.length === 0) return;
  const normalized = ((index % SETTINGS_TABS.length) + SETTINGS_TABS.length) % SETTINGS_TABS.length;
  currentTabIndex = normalized;
  const items = SETTINGS_TABS[currentTabIndex]?.items ?? [];
  if (items.length === 0) {
    settingsSelection = 0;
  } else {
    const first = getFirstSelectableIndex(currentTabIndex);
    settingsSelection = first < items.length ? first : 0;
  }
  settingsMessage = null;
  drawSettings();
}

function changeTab(delta: number) {
  if (SETTINGS_TABS.length <= 1) return;
  selectTab(currentTabIndex + delta);
}

function moveSelection(delta: number) {
  const items = SETTINGS_TABS[currentTabIndex]?.items ?? [];
  if (items.length === 0 || !tabHasSelectableSettings(currentTabIndex)) {
    return;
  }
  let next = settingsSelection;
  for (let i = 0; i < items.length; i += 1) {
    next = (next + delta + items.length) % items.length;
    if (items[next].type !== 'label') {
      settingsSelection = next;
      drawSettings();
      return;
    }
  }
}

// Handle canvas clicks and map to menu/buttons
canvas.addEventListener('click', (ev) => {
  const rect = canvas.getBoundingClientRect();
  const x = ev.clientX - rect.left;
  const y = ev.clientY - rect.top;

  const state = stateManager.getCurrentState();
  if (state === GameState.MENU) {
    if (startButtonRect && pointInRect(x, y, startButtonRect)) {
      stateManager.showState(GameState.GAME);
      game.start();
      return;
    }
    if (leaderboardButtonRect && pointInRect(x, y, leaderboardButtonRect)) {
      showLeaderboardFromMenu();
      return;
    }
    if (settingsButtonRect && pointInRect(x, y, settingsButtonRect)) {
      enterSettings(state);
      return;
    }
  } else if (state === GameState.SETTINGS) {
    const tabIdx = tabButtonRects.findIndex((rect) => pointInRect(x, y, rect));
    if (tabIdx !== -1) {
      selectTab(tabIdx);
      return;
    }
    if (backButtonRect && pointInRect(x, y, backButtonRect)) {
      exitSettings();
      return;
    }
  } else if (state === GameState.LEADERBOARD) {
    leaderboardScreenData = {
      entries: leaderboardScreenData.entries,
      highlightIndex: null,
      finalScore: leaderboardScreenData.finalScore,
      playerName: leaderboardScreenData.playerName,
      fromGame: false,
      didQualify: false
    };
    stateManager.showState(GameState.MENU);
    drawMenu();
    return;
  }
});

function pointInRect(px: number, py: number, r: DOMRect) {
  return px >= r.x && px <= r.x + r.width && py >= r.y && py <= r.y + r.height;
}

function persistSettings(values: PersistentConfig) {
  settingsValues = { ...settingsValues, ...values };
  configStore.save(settingsValues);
  game.refreshSettings(settingsValues);
}

function adjustNumberSetting(option: Extract<SettingItem, { type: 'number' }>, direction: number) {
  const currentRaw = settingsValues[option.key];
  const current = typeof currentRaw === 'number' ? currentRaw : option.min;
  const decimals = option.step.toString().split('.')[1]?.length ?? 0;
  const next = clampNumber(current + direction * option.step, option.min, option.max, decimals);
  persistSettings({ [option.key]: next } as PersistentConfig);
  settingsMessage = null;
  drawSettings();
}

function toggleBooleanSetting(option: Extract<SettingItem, { type: 'toggle' }>) {
  const currentRaw = settingsValues[option.key];
  const next = !(typeof currentRaw === 'boolean' ? currentRaw : Boolean(currentRaw));
  persistSettings({ [option.key]: next } as PersistentConfig);
  settingsMessage = null;
  drawSettings();
}

function cycleOptionSetting(option: Extract<SettingItem, { type: 'cycle' }>, direction: number) {
  const choices = option.options;
  if (!choices.length) {
    return;
  }
  const currentRaw = settingsValues[option.key];
  const currentIndex = typeof currentRaw === 'string' ? choices.indexOf(currentRaw) : -1;
  const nextIndex =
    currentIndex === -1
      ? direction > 0
        ? 0
        : choices.length - 1
      : (currentIndex + direction + choices.length) % choices.length;
  const nextValue = choices[nextIndex];
  persistSettings({ [option.key]: nextValue } as PersistentConfig);
  settingsMessage = null;
  drawSettings();
}

function clampNumber(value: number, min: number, max: number, decimals: number) {
  const clamped = Math.max(min, Math.min(max, value));
  const factor = Math.pow(10, decimals);
  return Math.round(clamped * factor) / factor;
}

function handleSettingsKey(e: KeyboardEvent) {
  const items = SETTINGS_TABS[currentTabIndex]?.items ?? [];
  const option = items[settingsSelection];
  switch (e.key) {
    case 'ArrowDown':
      moveSelection(1);
      e.preventDefault();
      break;
    case 'ArrowUp':
      moveSelection(-1);
      e.preventDefault();
      break;
    case 'ArrowLeft':
      if (option?.type === 'number') {
        adjustNumberSetting(option, -1);
        e.preventDefault();
      } else if (option?.type === 'toggle') {
        toggleBooleanSetting(option);
        e.preventDefault();
      } else if (option?.type === 'cycle') {
        cycleOptionSetting(option, -1);
        e.preventDefault();
      }
      break;
    case 'ArrowRight':
      if (option?.type === 'number') {
        adjustNumberSetting(option, +1);
        e.preventDefault();
      } else if (option?.type === 'toggle') {
        toggleBooleanSetting(option);
        e.preventDefault();
      } else if (option?.type === 'cycle') {
        cycleOptionSetting(option, +1);
        e.preventDefault();
      }
      break;
    case 'Enter':
      if (option?.type === 'action') {
        option.onActivate();
        drawSettings();
        e.preventDefault();
      } else if (option?.type === 'toggle') {
        toggleBooleanSetting(option);
        e.preventDefault();
      }
      break;
    case 'q':
    case 'Q':
      changeTab(-1);
      e.preventDefault();
      break;
    case 'e':
    case 'E':
      changeTab(1);
      e.preventDefault();
      break;
    case 'Escape':
      exitSettings();
      e.preventDefault();
      break;
    default:
      break;
  }
}

function handleLeaderboardKey(e: KeyboardEvent) {
  if (['ArrowUp', 'ArrowRight', 'ArrowDown', 'ArrowLeft'].includes(e.key)) {
    e.preventDefault();
    return;
  }
  if (['Enter', 'Escape', ' '].includes(e.key)) {
    leaderboardScreenData = {
      entries: leaderboardScreenData.entries,
      highlightIndex: null,
      finalScore: leaderboardScreenData.finalScore,
      playerName: leaderboardScreenData.playerName,
      fromGame: false,
      didQualify: false
    };
    stateManager.showState(GameState.MENU);
    drawMenu();
    e.preventDefault();
  }
}

// Redraw UI when state changes
stateManager.onChange((s) => {
  if (s === GameState.MENU) {
    settingsMessage = null;
    drawMenu();
  }
  if (s === GameState.SETTINGS) {
    settingsSelection = getFirstSelectableIndex(currentTabIndex);
    settingsMessage = null;
    drawSettings();
  }
  if (s === GameState.GAME) {
    // clear menu UI; game.start will kick off the game loop which draws to canvas
    clearCanvas();
  }
  if (s === GameState.LEADERBOARD) {
    drawLeaderboardScreen();
  }
});

// Initial draw
drawMenu();

// Keyboard handling for game and settings
document.addEventListener('keydown', (e) => {
  const state = stateManager.getCurrentState();
  if (e.key === 'o' || e.key === 'O') {
    if (state === GameState.SETTINGS) {
      exitSettings();
    } else {
      enterSettings(state);
    }
    e.preventDefault();
    return;
  }
  if (state === GameState.SETTINGS) {
    handleSettingsKey(e);
    return;
  }
  if (state === GameState.LEADERBOARD) {
    handleLeaderboardKey(e);
    return;
  }
});
