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
let settingsValues: PersistentConfig = {
  ...persistedConfig,
  initialTime: persistedConfig.initialTime ?? 60,
  maxTimeBonus: persistedConfig.maxTimeBonus ?? 3,
  bonusWindow: persistedConfig.bonusWindow ?? 2.5,
  ringRadiusFactor: persistedConfig.ringRadiusFactor ?? 0.18,
  minTimeBonus: persistedConfig.minTimeBonus ?? 0.5,
  mechanicInterval: persistedConfig.mechanicInterval ?? 10,
  mechanicRandomize: persistedConfig.mechanicRandomize ?? false,
  symbolScale: persistedConfig.symbolScale ?? 1,
  symbolStroke: persistedConfig.symbolStroke ?? 1,
  uiFontScale: persistedConfig.uiFontScale ?? 0.9,
  particlesPerScore: persistedConfig.particlesPerScore ?? 4
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
    };

const SETTINGS_ITEMS: SettingItem[] = [
  { type: 'label', label: 'Gameplay' },
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
    max: 12,
    step: 1,
    format: (v) => `${Math.round(v)}`
  },
  { type: 'label', label: 'Mechanics' },
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
  { type: 'label', label: 'System' },
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
];

const getFirstSelectableIndex = (): number => {
  const idx = SETTINGS_ITEMS.findIndex((item) => item.type !== 'label');
  return idx === -1 ? 0 : idx;
};

const hasSelectableSettings = SETTINGS_ITEMS.some((item) => item.type !== 'label');

let settingsSelection = getFirstSelectableIndex();
let settingsMessage: string | null = null;

// Menu UI button rectangles (in CSS pixels)
let startButtonRect: DOMRect | null = null;
let settingsButtonRect: DOMRect | null = null;
let backButtonRect: DOMRect | null = null;

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

  const listStartY = Math.round(cssH * 0.24);
  const baseSpacing = Math.max(24, Math.round(cssH * 0.052));
  const rowSpacing = Math.max(22, Math.round(baseSpacing * Math.max(0.82, fontScale)));
  const rowHeight = Math.max(18, Math.round(cssH * 0.042 * Math.max(0.85, fontScale)));
  const marginX = Math.round(cssW * 0.12);
  const labelSize = Math.max(9, Math.round(cssH * 0.021 * fontScale));
  const valueSize = Math.max(11, Math.round(cssH * 0.028 * fontScale));
  const headingSize = Math.max(10, Math.round(labelSize * 0.78));

  SETTINGS_ITEMS.forEach((item, idx) => {
    const y = listStartY + idx * rowSpacing;
    const isSelected = idx === settingsSelection;
    const selectable = item.type !== 'label';
    const displayY = y + rowHeight / 2;

    if (isSelected && selectable) {
      ctx.fillStyle = 'rgba(79, 70, 229, 0.18)';
      roundRect(ctx, marginX * 0.6, y - rowHeight * 0.2, cssW - marginX * 1.2, rowHeight, Math.min(12, rowHeight * 0.35), true, false);
    }

    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';

    if (item.type === 'label') {
      ctx.save();
      ctx.font = `${headingSize}px Orbitron, sans-serif`;
      ctx.fillStyle = 'rgba(133, 189, 255, 0.8)';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(item.label.toUpperCase(), marginX, displayY + headingSize * 0.22);
      const underlineY = displayY + headingSize * 0.45;
      ctx.strokeStyle = 'rgba(66, 88, 140, 0.45)';
      ctx.lineWidth = Math.max(1, headingSize * 0.08);
      ctx.beginPath();
      ctx.moveTo(marginX, underlineY);
      ctx.lineTo(cssW - marginX * 0.8, underlineY);
      ctx.stroke();
      ctx.restore();
      return;
    }

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
    } else {
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
  ctx.fillText('Use UP/DOWN to select, LEFT/RIGHT to adjust, Enter to confirm, Esc to exit', cssW / 2, btnY - Math.max(24, Math.round(cssH * 0.06)));
  ctx.restore();
}

function moveSelection(delta: number) {
  if (!hasSelectableSettings) {
    return;
  }
  let next = settingsSelection;
  do {
    next = (next + delta + SETTINGS_ITEMS.length) % SETTINGS_ITEMS.length;
  } while (SETTINGS_ITEMS[next].type === 'label');
  settingsSelection = next;
  drawSettings();
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

function clampNumber(value: number, min: number, max: number, decimals: number) {
  const clamped = Math.max(min, Math.min(max, value));
  const factor = Math.pow(10, decimals);
  return Math.round(clamped * factor) / factor;
}

function handleSettingsKey(e: KeyboardEvent) {
  const option = SETTINGS_ITEMS[settingsSelection];
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
      }
      break;
    case 'ArrowRight':
      if (option?.type === 'number') {
        adjustNumberSetting(option, +1);
        e.preventDefault();
      } else if (option?.type === 'toggle') {
        toggleBooleanSetting(option);
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
    settingsSelection = getFirstSelectableIndex();
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
