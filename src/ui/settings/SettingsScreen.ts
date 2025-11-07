import type { Config as PersistentConfig } from '../../storage/ConfigStore';
import type { Action } from '../../input/Keymap';
import { clearCanvas, drawButton, fillRoundedRect, pointInRect, strokeRoundedRect } from '../canvasUtils';
import { SETTINGS_TABS, type SettingItem, type SettingsTab } from './schema';

type SettingsScreenOptions = {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  initialValues: PersistentConfig;
  onChange: (values: PersistentConfig) => void;
  onResetHighscore: () => void;
};

export class SettingsScreen {
  private readonly options: SettingsScreenOptions;
  private values: PersistentConfig;
  private currentTabIndex = 0;
  private selectionIndex: number;
  private tabFocus = false;
  private message: string | null = null;
  private backButtonRect: DOMRect | null = null;
  private tabButtonRects: DOMRect[] = [];

  constructor(options: SettingsScreenOptions) {
    this.options = options;
    this.values = { ...options.initialValues };
    this.selectionIndex = this.getFirstSelectableIndex(this.currentTabIndex);
  }

  setValues(values: PersistentConfig) {
    this.values = { ...values };
    this.selectionIndex = this.getFirstSelectableIndex(this.currentTabIndex);
  }

  getValues() {
    return { ...this.values };
  }

  enter() {
    this.message = null;
    this.tabFocus = false;
    this.selectionIndex = this.getFirstSelectableIndex(this.currentTabIndex);
    this.draw();
  }

  draw() {
    const { canvas, ctx } = this.options;
    const cssW = canvas.clientWidth;
    const cssH = canvas.clientHeight;

    clearCanvas(canvas, ctx);

    const fontScale = clampNumber(this.values.uiFontScale ?? 1, 0.5, 1.4, 2);
    const titleSize = Math.max(16, Math.round(cssH * 0.045 * Math.max(0.75, fontScale)));
    ctx.save();
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
    const totalTabWidth =
      tabMetrics.reduce((sum, metric) => sum + metric.width, 0) + tabSpacing * Math.max(SETTINGS_TABS.length - 1, 0);
    let tabCursorX = Math.round(Math.max(marginX * 0.6, (cssW - totalTabWidth) / 2));
    const tabCenterY = Math.round(cssH * 0.2);
    this.tabButtonRects = [];

    SETTINGS_TABS.forEach((tab, idx) => {
      const metric = tabMetrics[idx];
      const tabX = tabCursorX;
      const tabY = tabCenterY - metric.height / 2;
      const isActive = idx === this.currentTabIndex;
      const isFocusedTab = isActive && this.tabFocus;
      const radius = Math.min(20, metric.height / 2);
      ctx.fillStyle = isFocusedTab
        ? 'rgba(126, 231, 135, 0.4)'
        : isActive
          ? 'rgba(34, 197, 94, 0.24)'
          : 'rgba(148, 163, 184, 0.14)';
      fillRoundedRect(ctx, tabX, tabY, metric.width, metric.height, radius);
      ctx.fillStyle = isFocusedTab ? '#f8fafc' : isActive ? '#7ee787' : '#94a3b8';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `${tabFontSize}px Orbitron, sans-serif`;
      ctx.fillText(tab.label, tabX + metric.width / 2, tabCenterY);
      if (isFocusedTab) {
        ctx.strokeStyle = 'rgba(126, 231, 135, 0.9)';
        ctx.lineWidth = 2;
        strokeRoundedRect(ctx, tabX + 2, tabY + 2, metric.width - 4, metric.height - 4, radius);
      }
      this.tabButtonRects[idx] = new DOMRect(tabX, tabY, metric.width, metric.height);
      tabCursorX += metric.width + tabSpacing;
    });

    const items = this.getCurrentTab().items;
    const listStartY = tabCenterY + tabBarHeight / 2 + Math.max(20, Math.round(cssH * 0.035));
    const baseSpacing = Math.max(24, Math.round(cssH * 0.052));
    const rowSpacing = Math.max(22, Math.round(baseSpacing * Math.max(0.82, fontScale)));
    const rowHeight = Math.max(18, Math.round(cssH * 0.042 * Math.max(0.85, fontScale)));
    const labelSize = Math.max(9, Math.round(cssH * 0.021 * fontScale));
    const valueSize = Math.max(11, Math.round(cssH * 0.028 * fontScale));
    ctx.textBaseline = 'middle';

    items.forEach((item, idx) => {
      const y = listStartY + idx * rowSpacing;
      const isSelected = idx === this.selectionIndex;
      const displayY = y + rowHeight / 2;

      if (isSelected && item.type !== 'label') {
        ctx.fillStyle = 'rgba(79, 70, 229, 0.18)';
        fillRoundedRect(
          ctx,
          marginX * 0.6,
          y - rowHeight * 0.2,
          cssW - marginX * 1.2,
          rowHeight,
          Math.min(12, rowHeight * 0.35)
        );
      }

      ctx.textAlign = 'left';
      ctx.font = `${labelSize}px Orbitron, sans-serif`;
      ctx.fillStyle = isSelected ? '#cdd7ff' : '#9aa5be';
      ctx.fillText(item.label, marginX, displayY);

      if (item.type === 'number') {
        const raw = this.values[item.key] ?? 0;
        ctx.textAlign = 'right';
        ctx.font = `${valueSize}px Orbitron, sans-serif`;
        ctx.fillStyle = isSelected ? '#79c0ff' : '#cbd5f5';
        ctx.fillText(item.format(Number(raw)), cssW - marginX, displayY);
      } else if (item.type === 'toggle') {
        const raw = this.values[item.key];
        const enabled = typeof raw === 'boolean' ? raw : Boolean(raw);
        const text = item.format ? item.format(enabled) : enabled ? 'On' : 'Off';
        ctx.textAlign = 'right';
        ctx.font = `${valueSize}px Orbitron, sans-serif`;
        ctx.fillStyle = isSelected ? '#7ee787' : '#cbd5f5';
        ctx.fillText(text, cssW - marginX, displayY);
      } else if (item.type === 'cycle') {
        const raw = this.values[item.key];
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

    if (this.message) {
      ctx.textAlign = 'center';
      ctx.font = `${Math.max(12, Math.round(cssH * 0.028 * fontScale))}px Orbitron, sans-serif`;
      ctx.fillStyle = '#7ee787';
      ctx.fillText(this.message, cssW / 2, cssH * 0.72);
    }

    const btnW = Math.round(cssW * 0.3);
    const btnH = Math.max(36, Math.round(cssH * 0.07));
    const btnX = Math.round((cssW - btnW) / 2);
    const btnY = Math.round(cssH * 0.82);

    ctx.textAlign = 'center';
    ctx.font = `${Math.max(11, Math.round(cssH * 0.025 * fontScale))}px Orbitron, sans-serif`;
    drawButton(ctx, btnX, btnY, btnW, btnH, 'Back', {
      font: `${Math.max(11, Math.round(cssH * 0.025 * fontScale))}px Orbitron, sans-serif`
    });
    this.backButtonRect = new DOMRect(btnX, btnY, btnW, btnH);

    ctx.font = `${Math.max(9, Math.round(cssH * 0.02 * fontScale))}px Orbitron, sans-serif`;
    ctx.fillStyle = 'rgba(148, 163, 184, 0.9)';
    ctx.fillText(
      'Arrows move and adjust - Press UP on the first row to focus tabs - Enter toggles - O hides settings',
      cssW / 2,
      btnY - Math.max(24, Math.round(cssH * 0.06))
    );
    ctx.restore();
  }

  handleAction(action: Action): boolean {
    const items = this.getCurrentTab().items;
    const option = items[this.selectionIndex];
    switch (action) {
      case 'down':
        if (this.tabFocus) {
          if (this.tabHasSelectableSettings(this.currentTabIndex)) {
            this.tabFocus = false;
            this.selectionIndex = this.getFirstSelectableIndex(this.currentTabIndex);
            this.draw();
          }
          return false;
        }
        this.moveSelection(1);
        return false;
      case 'up': {
        if (this.tabFocus) {
          return false;
        }
        if (!this.tabHasSelectableSettings(this.currentTabIndex)) {
          this.tabFocus = true;
          this.draw();
          return false;
        }
        const first = this.getFirstSelectableIndex(this.currentTabIndex);
        if (this.selectionIndex === first) {
          this.tabFocus = true;
          this.draw();
          return false;
        }
        this.moveSelection(-1);
        return false;
      }
      case 'left':
        if (this.tabFocus) {
          this.changeTab(-1, { focusMode: 'tabs' });
        } else {
          this.adjustOption(option, -1);
        }
        return false;
      case 'right':
        if (this.tabFocus) {
          this.changeTab(1, { focusMode: 'tabs' });
        } else {
          this.adjustOption(option, 1);
        }
        return false;
      case 'confirm':
        if (this.tabFocus) {
          if (this.tabHasSelectableSettings(this.currentTabIndex)) {
            this.tabFocus = false;
            this.selectionIndex = this.getFirstSelectableIndex(this.currentTabIndex);
            this.draw();
          }
          return false;
        }
        if (option?.type === 'action') {
          this.triggerAction(option);
        } else if (option?.type === 'toggle') {
          this.toggleSetting(option);
        }
        return false;
      case 'cancel':
        return true;
      default:
        return false;
    }
  }

  handleKey(e: KeyboardEvent) {
    const map: Record<string, Action | null> = {
      ArrowUp: 'up',
      ArrowDown: 'down',
      ArrowLeft: 'left',
      ArrowRight: 'right',
      Enter: 'confirm',
      Escape: 'cancel'
    };
    const action = map[e.key] ?? null;
    if (action) {
      const exit = this.handleAction(action);
      e.preventDefault();
      return exit;
    }
    if (e.key === 'q' || e.key === 'Q') {
      this.changeTab(-1, { focusMode: 'tabs' });
      e.preventDefault();
    } else if (e.key === 'e' || e.key === 'E') {
      this.changeTab(1, { focusMode: 'tabs' });
      e.preventDefault();
    }
    return false;
  }

  handleClick(x: number, y: number) {
    const tabIdx = this.tabButtonRects.findIndex((rect) => pointInRect(x, y, rect));
    if (tabIdx !== -1) {
      this.selectTab(tabIdx, { focusMode: 'content' });
      return false;
    }
    if (pointInRect(x, y, this.backButtonRect)) {
      return true;
    }
    return false;
  }

  private getCurrentTab(): SettingsTab {
    return SETTINGS_TABS[this.currentTabIndex] ?? SETTINGS_TABS[0];
  }

  private persist(values: PersistentConfig) {
    this.values = { ...this.values, ...values };
    this.options.onChange(this.values);
    this.message = null;
    this.draw();
  }

  private adjustOption(option: SettingItem | undefined, direction: number) {
    if (!option) return;
    if (option.type === 'number') {
      this.adjustNumberSetting(option, direction);
    } else if (option.type === 'toggle') {
      this.toggleSetting(option);
    } else if (option.type === 'cycle') {
      this.cycleOption(option, direction);
    }
  }

  private adjustNumberSetting(option: Extract<SettingItem, { type: 'number' }>, direction: number) {
    const currentRaw = this.values[option.key];
    const current = typeof currentRaw === 'number' ? currentRaw : option.min;
    const decimals = option.step.toString().split('.')[1]?.length ?? 0;
    const next = clampNumber(current + direction * option.step, option.min, option.max, decimals);
    this.persist({ [option.key]: next } as PersistentConfig);
  }

  private toggleSetting(option: Extract<SettingItem, { type: 'toggle' }>) {
    const currentRaw = this.values[option.key];
    const next = !(typeof currentRaw === 'boolean' ? currentRaw : Boolean(currentRaw));
    this.persist({ [option.key]: next } as PersistentConfig);
  }

  private cycleOption(option: Extract<SettingItem, { type: 'cycle' }>, direction: number) {
    const choices = option.options;
    if (!choices.length) {
      return;
    }
    const currentRaw = this.values[option.key];
    const currentIndex = typeof currentRaw === 'string' ? choices.indexOf(currentRaw) : -1;
    const nextIndex =
      currentIndex === -1
        ? direction > 0
          ? 0
          : choices.length - 1
        : (currentIndex + direction + choices.length) % choices.length;
    const nextValue = choices[nextIndex];
    this.persist({ [option.key]: nextValue } as PersistentConfig);
  }

  private triggerAction(option: Extract<SettingItem, { type: 'action' }>) {
    if (option.action === 'resetHighscore') {
      this.options.onResetHighscore();
      this.message = 'Highscore reset';
      this.draw();
    }
  }

  private moveSelection(delta: number) {
    const items = this.getCurrentTab().items;
    if (items.length === 0 || !this.tabHasSelectableSettings(this.currentTabIndex)) {
      return;
    }
    this.tabFocus = false;
    let next = this.selectionIndex;
    for (let i = 0; i < items.length; i += 1) {
      next = (next + delta + items.length) % items.length;
      if (items[next].type !== 'label') {
        this.selectionIndex = next;
        this.draw();
        return;
      }
    }
  }

  private changeTab(delta: number, options?: { focusMode?: 'tabs' | 'content' }) {
    if (SETTINGS_TABS.length <= 1) return;
    this.selectTab(this.currentTabIndex + delta, options);
  }

  private selectTab(index: number, options?: { focusMode?: 'tabs' | 'content' }) {
    if (SETTINGS_TABS.length === 0) return;
    const normalized = ((index % SETTINGS_TABS.length) + SETTINGS_TABS.length) % SETTINGS_TABS.length;
    this.currentTabIndex = normalized;
    const items = this.getCurrentTab().items;
    if (items.length === 0) {
      this.selectionIndex = 0;
    } else {
      const first = this.getFirstSelectableIndex(normalized);
      this.selectionIndex = first < items.length ? first : 0;
    }
    if (options?.focusMode === 'tabs') {
      this.tabFocus = true;
    } else if (options?.focusMode === 'content') {
      this.tabFocus = false;
    } else if (!this.tabHasSelectableSettings(normalized)) {
      this.tabFocus = true;
    }
    this.message = null;
    this.draw();
  }

  private getFirstSelectableIndex(tabIndex: number) {
    const items = SETTINGS_TABS[tabIndex]?.items ?? [];
    const idx = items.findIndex((item) => item.type !== 'label');
    return idx === -1 ? 0 : idx;
  }

  private tabHasSelectableSettings(tabIndex: number) {
    const items = SETTINGS_TABS[tabIndex]?.items ?? [];
    return items.some((item) => item.type !== 'label');
  }
}

function clampNumber(value: number, min: number, max: number, decimals: number) {
  const clamped = Math.max(min, Math.min(max, value));
  const factor = Math.pow(10, decimals);
  return Math.round(clamped * factor) / factor;
}

