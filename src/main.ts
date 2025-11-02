import './styles/ui.scss';
import { Game } from './game/Game';
import { GameStateManager, GameState } from './core/GameStateManager';
import ConfigStore from './storage/ConfigStore';
import type { Config as PersistentConfig } from './storage/ConfigStore';
// Initialize game state manager
const stateManager = new GameStateManager();

// Initialize game with canvas
const canvas = document.getElementById('game') as HTMLCanvasElement;
if (!canvas) throw new Error('Canvas element not found');

const ctx = canvas.getContext('2d')!;

const configStore = new ConfigStore();
const persistedConfig = configStore.load();
const persistedMemoryPreview = persistedConfig.memoryPreviewDuration ?? 1;
const persistedParticlesPerScore = persistedConfig.particlesPerScore ?? 4;
const particlesEnabledDefault =
  persistedParticlesPerScore > 0 ? persistedConfig.particlesEnabled ?? true : false;
const persistedScoreRayCount = persistedConfig.scoreRayCount ?? 3;
const scoreRayEnabledDefault =
  persistedScoreRayCount > 0 ? persistedConfig.scoreRayEnabled ?? true : false;
let settingsValues: PersistentConfig = {
  ...persistedConfig,
  initialTime: persistedConfig.initialTime ?? 60,
  maxTimeBonus: persistedConfig.maxTimeBonus ?? 3,
  bonusWindow: persistedConfig.bonusWindow ?? 2.5,
  ringRadiusFactor: persistedConfig.ringRadiusFactor ?? 0.18,
  minTimeBonus: persistedConfig.minTimeBonus ?? 0.5,
  mechanicInterval: persistedConfig.mechanicInterval ?? 10,
  mechanicRandomize: persistedConfig.mechanicRandomize ?? false,
  memoryPreviewDuration: persistedMemoryPreview,
  difficulty: persistedConfig.difficulty ?? 'medium',
  symbolScale: persistedConfig.symbolScale ?? 1,
  symbolStroke: persistedConfig.symbolStroke ?? 1,
  uiFontScale: persistedConfig.uiFontScale ?? 0.9,
  particlesPerScore: persistedParticlesPerScore,
  particlesEnabled: particlesEnabledDefault,
  particlesPersist: persistedConfig.particlesPersist ?? false,
  scoreRayEnabled: scoreRayEnabledDefault,
  scoreRayCount: persistedScoreRayCount,
  scoreRayThickness: persistedConfig.scoreRayThickness ?? 1,
  scoreRayIntensity: persistedConfig.scoreRayIntensity ?? 1,
  mechanicEnableRemap: persistedConfig.mechanicEnableRemap ?? true,
  mechanicEnableSpin: persistedConfig.mechanicEnableSpin ?? true,
  mechanicEnableMemory: persistedConfig.mechanicEnableMemory ?? true,
  mechanicEnableJoystick: persistedConfig.mechanicEnableJoystick ?? true
};
configStore.save(settingsValues);

const game = new Game(canvas);
game.refreshSettings(settingsValues);

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
        options: ['easy', 'medium', 'hard'],
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
        type: 'toggle',
        key: 'particlesEnabled',
        label: 'Particles Enabled',
        format: (value) => (value ? 'On' : 'Off')
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
        type: 'toggle',
        key: 'scoreRayEnabled',
        label: 'Score Ray Enabled',
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
  const startY = Math.round(cssH * 0.4);
  const settingsY = startY + btnH + 16;

  ctx.font = `${Math.max(16, Math.round(cssH * 0.04))}px Orbitron, sans-serif`;
  drawButton(btnX, startY, btnW, btnH, 'Start Game');
  drawButton(btnX, settingsY, btnW, btnH, 'Settings');

  // store rects in CSS pixel coordinates
  startButtonRect = new DOMRect(btnX, startY, btnW, btnH);
  settingsButtonRect = new DOMRect(btnX, settingsY, btnW, btnH);

  const hintY = settingsY + btnH + Math.max(28, Math.round(cssH * 0.05));
  ctx.font = `${Math.max(12, Math.round(cssH * 0.03))}px Orbitron, sans-serif`;
  ctx.fillStyle = 'rgba(148, 163, 184, 0.85)';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText('Press O to open options', cssW / 2, hintY);

  ctx.restore();
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
    if (settingsButtonRect && pointInRect(x, y, settingsButtonRect)) {
      stateManager.showState(GameState.SETTINGS);
      return;
    }
  } else if (state === GameState.SETTINGS) {
    const tabIdx = tabButtonRects.findIndex((rect) => pointInRect(x, y, rect));
    if (tabIdx !== -1) {
      selectTab(tabIdx);
      return;
    }
    if (backButtonRect && pointInRect(x, y, backButtonRect)) {
      stateManager.showState(GameState.MENU);
      return;
    }
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
  const updates: Partial<PersistentConfig> = { [option.key]: next } as Partial<PersistentConfig>;
  if (option.key === 'particlesPerScore') {
    updates.particlesEnabled = next > 0;
  } else if (option.key === 'scoreRayCount') {
    updates.scoreRayEnabled = next > 0;
  }
  persistSettings(updates as PersistentConfig);
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
      stateManager.showState(GameState.MENU);
      e.preventDefault();
      break;
    default:
      break;
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
});

// Initial draw
drawMenu();

// Keyboard handling for game and settings
document.addEventListener('keydown', (e) => {
  const state = stateManager.getCurrentState();
  if (e.key === 'o' || e.key === 'O') {
    if (state === GameState.SETTINGS) {
      stateManager.showState(GameState.MENU);
    } else {
      stateManager.showState(GameState.SETTINGS);
    }
    e.preventDefault();
    return;
  }
  if (state === GameState.SETTINGS) {
    handleSettingsKey(e);
    return;
  }
  if (state === GameState.GAME) {
    const keys = ['ArrowUp', 'ArrowRight', 'ArrowDown', 'ArrowLeft'];
    if (keys.includes(e.key)) {
      try {
        (game as any).onKeyDown?.(e as KeyboardEvent);
      } catch (err) {
        console.error('[debug] forwarding key to game failed', err);
      }
    }
  }
});
