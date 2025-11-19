import type { Config as PersistentConfig } from '../../storage/ConfigStore';
import type { Action } from '../../input/Keymap';
import { clearCanvas, drawButton, fillRoundedRect, pointInRect, strokeRoundedRect } from '../canvasUtils';
import {
  SETTINGS_TABS,
  type SettingItem,
  type SettingsSection,
  type SettingsSubTab,
  type SettingsTab,
  type SettingsTabKey
} from './schema';
import {
  DEFAULT_SYMBOL_COLORS,
  clampColorValue,
  rgbToCss,
  sanitizeSymbolColors,
  type RGBColor
} from '../../config/colorPresets';

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
  private subTabFocus = false;
  private sectionFocus = false;
  private message: string | null = null;
  private backButtonRect: DOMRect | null = null;
  private tabButtonRects: DOMRect[] = [];
  private subTabButtonRects: DOMRect[] = [];
  private sectionButtonRects: DOMRect[] = [];
  private colorChannelFocus: Record<number, 0 | 1 | 2> = {};
  private colorEditIndex: number | null = null;
  private subTabIndices: Partial<Record<SettingsTabKey, number>> = {};
  private sectionIndices: Record<string, number> = {};

  constructor(options: SettingsScreenOptions) {
    this.options = options;
    this.values = { ...options.initialValues };
    this.selectionIndex = this.getFirstSelectableIndex(this.currentTabIndex);
  }

  setValues(values: PersistentConfig, options?: { preserveSelection?: boolean }) {
    const preserveSelection = options?.preserveSelection ?? false;
    this.values = { ...values };
    if (preserveSelection) {
      const items = this.getCurrentItems();
      if (items.length === 0) {
        this.selectionIndex = 0;
      } else {
        this.selectionIndex = Math.min(this.selectionIndex, items.length - 1);
        const current = items[this.selectionIndex];
        if (!current || current.type === 'label') {
          this.selectionIndex = this.getFirstSelectableIndex(this.currentTabIndex);
        }
      }
      // Keep focus and color edit state when preserving selection.
    } else {
      this.selectionIndex = this.getFirstSelectableIndex(this.currentTabIndex);
      this.colorChannelFocus = {};
      this.colorEditIndex = null;
      this.subTabFocus = false;
      this.sectionFocus = false;
      this.sectionIndices = {};
    }
  }

  getValues() {
    return { ...this.values };
  }

  enter() {
    this.message = null;
    this.tabFocus = false;
    this.subTabFocus = false;
    this.sectionFocus = false;
    this.colorEditIndex = null;
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

    const activeTab = this.getCurrentTab();
    const subTabs = activeTab.subTabs ?? [];
    const hasSubTabs = subTabs.length > 0;
    this.subTabButtonRects = [];
    this.sectionButtonRects = [];

    let listStartY = tabCenterY + tabBarHeight / 2 + Math.max(20, Math.round(cssH * 0.035));
    if (hasSubTabs) {
      const subFontSize = Math.max(11, Math.round(cssH * 0.027 * Math.max(0.75, fontScale)));
      const subPaddingX = Math.max(20, Math.round(cssW * 0.03));
      const subPaddingY = Math.max(10, Math.round(subFontSize * 0.5));
      const subSpacing = Math.max(12, Math.round(cssW * 0.015));
      const subMetrics = subTabs.map((tab) => {
        const width = ctx.measureText(tab.label).width + subPaddingX;
        const height = Math.max(subFontSize + subPaddingY, 30);
        return { width, height };
      });
      const subBarHeight = subMetrics.reduce((max, metric) => Math.max(max, metric.height), 0);
      const totalSubWidth =
        subMetrics.reduce((sum, metric) => sum + metric.width, 0) + subSpacing * Math.max(subTabs.length - 1, 0);
      let subCursorX = Math.round(Math.max(marginX * 0.8, (cssW - totalSubWidth) / 2));
      const subCenterY = listStartY + subBarHeight / 2;
      const activeSubIndex = this.getCurrentSubTabIndex();
      subTabs.forEach((tab, idx) => {
        const metric = subMetrics[idx];
        const subX = subCursorX;
        const subY = subCenterY - metric.height / 2;
        const isActive = idx === activeSubIndex;
        const isFocused = isActive && this.subTabFocus;
        const radius = Math.min(18, metric.height / 2);
        ctx.fillStyle = isFocused
          ? 'rgba(79, 70, 229, 0.32)'
          : isActive
            ? 'rgba(34, 197, 94, 0.25)'
            : 'rgba(148, 163, 184, 0.18)';
        fillRoundedRect(ctx, subX, subY, metric.width, metric.height, radius);
        ctx.fillStyle = isFocused ? '#f8fafc' : isActive ? '#7ee787' : '#94a3b8';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = `${subFontSize}px Orbitron, sans-serif`;
        ctx.fillText(tab.label, subX + metric.width / 2, subCenterY);
        if (isFocused) {
          ctx.strokeStyle = 'rgba(126, 231, 135, 0.9)';
          ctx.lineWidth = 2;
          strokeRoundedRect(ctx, subX + 2, subY + 2, metric.width - 4, metric.height - 4, radius);
        }
        this.subTabButtonRects[idx] = new DOMRect(subX, subY, metric.width, metric.height);
        subCursorX += metric.width + subSpacing;
      });
      listStartY = subCenterY + subBarHeight / 2 + Math.max(18, Math.round(cssH * 0.03));
    }

    const sections = this.getCurrentSections();
    const hasSections = sections.length > 0;
    if (hasSections) {
      const sectionFontSize = Math.max(11, Math.round(cssH * 0.024 * Math.max(0.75, fontScale)));
      const sectionPaddingX = Math.max(18, Math.round(cssW * 0.025));
      const sectionPaddingY = Math.max(8, Math.round(sectionFontSize * 0.45));
      const sectionSpacing = Math.max(10, Math.round(cssW * 0.015));
      const sectionMetrics = sections.map((section) => {
        const width = ctx.measureText(section.label).width + sectionPaddingX;
        const height = Math.max(sectionFontSize + sectionPaddingY, 28);
        return { width, height };
      });
      const sectionBarHeight = sectionMetrics.reduce((max, metric) => Math.max(max, metric.height), 0);
      const totalSectionWidth =
        sectionMetrics.reduce((sum, metric) => sum + metric.width, 0) +
        sectionSpacing * Math.max(sections.length - 1, 0);
      let sectionCursorX = Math.round(Math.max(marginX, (cssW - totalSectionWidth) / 2));
      const sectionCenterY = listStartY + sectionBarHeight / 2;
      const activeSectionIndex = this.getCurrentSectionIndex();
      sections.forEach((section, idx) => {
        const metric = sectionMetrics[idx];
        const sectionX = sectionCursorX;
        const sectionY = sectionCenterY - metric.height / 2;
        const isActiveSection = idx === activeSectionIndex;
        const isFocusedSection = isActiveSection && this.sectionFocus;
        const radius = Math.min(16, metric.height / 2);
        ctx.fillStyle = isFocusedSection
          ? 'rgba(79, 70, 229, 0.35)'
          : isActiveSection
            ? 'rgba(34, 197, 94, 0.22)'
            : 'rgba(148, 163, 184, 0.15)';
        fillRoundedRect(ctx, sectionX, sectionY, metric.width, metric.height, radius);
        ctx.fillStyle = isFocusedSection ? '#f8fafc' : isActiveSection ? '#7ee787' : '#94a3b8';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = `${sectionFontSize}px Orbitron, sans-serif`;
        ctx.fillText(section.label, sectionX + metric.width / 2, sectionCenterY);
        if (isFocusedSection) {
          ctx.strokeStyle = 'rgba(126, 231, 135, 0.9)';
          ctx.lineWidth = 2;
          strokeRoundedRect(ctx, sectionX + 2, sectionY + 2, metric.width - 4, metric.height - 4, radius);
        }
        this.sectionButtonRects[idx] = new DOMRect(sectionX, sectionY, metric.width, metric.height);
        sectionCursorX += metric.width + sectionSpacing;
      });
      listStartY = sectionCenterY + sectionBarHeight / 2 + Math.max(16, Math.round(cssH * 0.028));
    }

    const items = this.getCurrentItems();
    const colorPalette = sanitizeSymbolColors(this.values.symbolColors);
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

      const isColorItem = item.type === 'color';
      const editingColor = isColorItem && this.isColorEditIndexActive(item.index);

      if (isSelected && item.type !== 'label') {
        ctx.fillStyle = editingColor ? 'rgba(217, 119, 6, 0.22)' : 'rgba(79, 70, 229, 0.18)';
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
      let labelColor = isSelected ? '#cdd7ff' : '#9aa5be';
      if (item.type === 'label' && item.color) {
        labelColor = item.color;
      }
      ctx.fillStyle = editingColor ? '#fde047' : labelColor;
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
      } else if (item.type === 'color') {
        const color = colorPalette[item.index] ?? DEFAULT_SYMBOL_COLORS[item.index % DEFAULT_SYMBOL_COLORS.length];
        const highlightTop = y - rowHeight * 0.2;
        const highlightHeight = rowHeight;
        const previewPadding = Math.max(2, rowHeight * 0.08);
        const previewSize = Math.max(
          14,
          Math.min(highlightHeight - previewPadding * 2, rowHeight * 0.85)
        );
        const previewX = cssW - marginX - previewSize;
        const previewY = highlightTop + (highlightHeight - previewSize) / 2;
        ctx.save();
        ctx.fillStyle = rgbToCss(color);
        ctx.fillRect(previewX, previewY, previewSize, previewSize);
        ctx.lineWidth = 1.2;
        ctx.strokeStyle = 'rgba(15, 23, 42, 0.65)';
        ctx.strokeRect(previewX, previewY, previewSize, previewSize);
        ctx.restore();

        const channels: Array<{ label: string; value: number }> = [
          { label: 'R', value: color.r },
          { label: 'G', value: color.g },
          { label: 'B', value: color.b }
        ];
        const focusChannel = this.getColorChannel(item.index);
        const editing = this.isColorEditIndexActive(item.index);
        ctx.font = `${valueSize}px Orbitron, sans-serif`;
        ctx.textAlign = 'right';
        const channelWidth = Math.max(
          ctx.measureText('R:000').width,
          ctx.measureText('G:000').width,
          ctx.measureText('B:000').width
        );
        const channelGap = Math.max(20, rowHeight * 0.6);
        const activeColor = editing ? '#fbbf24' : '#7ee787';
        const selectedColor = editing ? '#fde68a' : '#cbd5f5';
        let cursorX = previewX - Math.max(18, rowHeight * 0.45);
        for (let channelIdx = channels.length - 1; channelIdx >= 0; channelIdx -= 1) {
          const channel = channels[channelIdx];
          const active = isSelected && focusChannel === channelIdx;
          const valueText = channel.value.toString().padStart(3, '0');
          const text = `${channel.label}:${valueText}`;
          ctx.fillStyle = active ? activeColor : isSelected ? selectedColor : '#94a3b8';
          ctx.fillText(text, cursorX, displayY);
          cursorX -= channelWidth + channelGap;
        }
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
      'Arrows move - Press UP to focus section or sub-tabs, then tabs - Left/Right switch RGB channels - Enter toggles color edit (Up/Down change value) - O hides settings',
      cssW / 2,
      btnY - Math.max(24, Math.round(cssH * 0.06))
    );
    ctx.restore();
  }

  handleAction(action: Action): boolean {
    const items = this.getCurrentItems();
    const option = items[this.selectionIndex];
    const hasSubTabs = this.hasSubTabs();
    const hasSections = this.hasSections();
    switch (action) {
      case 'down':
        if (this.tabFocus) {
          if (hasSubTabs) {
            this.tabFocus = false;
            this.subTabFocus = true;
            this.draw();
          } else if (hasSections) {
            this.tabFocus = false;
            this.sectionFocus = true;
            this.draw();
          } else if (this.tabHasSelectableSettings(this.currentTabIndex)) {
            this.tabFocus = false;
            this.sectionFocus = false;
            this.selectionIndex = this.getFirstSelectableIndex(this.currentTabIndex);
            this.draw();
          }
          return false;
        }
        if (this.subTabFocus) {
          if (hasSections) {
            this.subTabFocus = false;
            this.sectionFocus = true;
            this.draw();
            return false;
          }
          if (this.tabHasSelectableSettings(this.currentTabIndex)) {
            this.subTabFocus = false;
            this.sectionFocus = false;
            this.selectionIndex = this.getFirstSelectableIndex(this.currentTabIndex);
            this.draw();
          }
          return false;
        }
        if (this.sectionFocus) {
          if (this.tabHasSelectableSettings(this.currentTabIndex)) {
            this.sectionFocus = false;
            this.selectionIndex = this.getFirstSelectableIndex(this.currentTabIndex);
            this.draw();
          }
          return false;
        }
        if (this.isEditingColorOption(option)) {
          this.adjustColorSetting(option, -1);
          return false;
        }
        this.moveSelection(1);
        return false;
      case 'up': {
        if (this.tabFocus) {
          return false;
        }
        if (this.subTabFocus) {
          this.subTabFocus = false;
          this.tabFocus = true;
          this.draw();
          return false;
        }
        if (this.sectionFocus) {
          this.sectionFocus = false;
          if (hasSubTabs) {
            this.subTabFocus = true;
          } else {
            this.tabFocus = true;
          }
          this.draw();
          return false;
        }
        if (this.isEditingColorOption(option)) {
          this.adjustColorSetting(option, 1);
          return false;
        }
        if (!this.tabHasSelectableSettings(this.currentTabIndex)) {
          this.tabFocus = true;
          this.draw();
          return false;
        }
        const first = this.getFirstSelectableIndex(this.currentTabIndex);
        if (this.selectionIndex === first) {
          if (hasSections) {
            this.sectionFocus = true;
          } else if (hasSubTabs) {
            this.subTabFocus = true;
          } else {
            this.tabFocus = true;
          }
          this.draw();
          return false;
        }
        this.moveSelection(-1);
        return false;
      }
      case 'left':
        if (this.tabFocus) {
          this.changeTab(-1, { focusMode: 'tabs' });
        } else if (this.subTabFocus) {
          this.changeSubTab(-1);
        } else if (this.sectionFocus) {
          this.changeSection(-1);
        } else {
          if (option?.type === 'color') {
            this.changeColorChannel(option, -1);
          } else {
            this.adjustOption(option, -1);
          }
        }
        return false;
      case 'right':
        if (this.tabFocus) {
          this.changeTab(1, { focusMode: 'tabs' });
        } else if (this.subTabFocus) {
          this.changeSubTab(1);
        } else if (this.sectionFocus) {
          this.changeSection(1);
        } else {
          if (option?.type === 'color') {
            this.changeColorChannel(option, 1);
          } else {
            this.adjustOption(option, 1);
          }
        }
        return false;
      case 'confirm':
        if (this.tabFocus) {
          if (hasSubTabs) {
            this.tabFocus = false;
            this.subTabFocus = true;
            this.sectionFocus = false;
            this.draw();
          } else if (hasSections) {
            this.tabFocus = false;
            this.sectionFocus = true;
            this.draw();
          } else if (this.tabHasSelectableSettings(this.currentTabIndex)) {
            this.tabFocus = false;
            this.sectionFocus = false;
            this.selectionIndex = this.getFirstSelectableIndex(this.currentTabIndex);
            this.draw();
          }
          return false;
        }
        if (this.subTabFocus) {
          if (hasSections) {
            this.subTabFocus = false;
            this.sectionFocus = true;
            this.draw();
            return false;
          }
          this.subTabFocus = false;
          if (this.tabHasSelectableSettings(this.currentTabIndex)) {
            this.sectionFocus = false;
            this.selectionIndex = this.getFirstSelectableIndex(this.currentTabIndex);
          }
          this.draw();
          return false;
        }
        if (this.sectionFocus) {
          this.sectionFocus = false;
          if (this.tabHasSelectableSettings(this.currentTabIndex)) {
            this.selectionIndex = this.getFirstSelectableIndex(this.currentTabIndex);
          }
          this.draw();
          return false;
        }
        if (option?.type === 'color') {
          this.toggleColorEditMode(option);
          return false;
        }
        if (!option) {
          return false;
        }
        if (option.type === 'action') {
          this.triggerAction(option);
        } else if (option.type === 'toggle') {
          this.toggleSetting(option);
        }
        return false;
      case 'cancel':
        if (this.colorEditIndex !== null) {
          this.clearColorEditMode(true);
          return false;
        }
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
    const subIdx = this.subTabButtonRects.findIndex((rect) => pointInRect(x, y, rect));
    if (subIdx !== -1) {
      this.selectSubTab(subIdx);
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

  private adjustColorSetting(option: Extract<SettingItem, { type: 'color' }>, direction: number) {
    const palette = sanitizeSymbolColors(this.values.symbolColors);
    const fallback = DEFAULT_SYMBOL_COLORS[option.index % DEFAULT_SYMBOL_COLORS.length];
    const current = palette[option.index] ?? fallback;
    const channel = this.getColorChannel(option.index);
    const delta = direction * (option.step ?? 1);
    const next: RGBColor = { ...current };
    if (channel === 0) {
      next.r = clampColorValue(next.r + delta);
    } else if (channel === 1) {
      next.g = clampColorValue(next.g + delta);
    } else {
      next.b = clampColorValue(next.b + delta);
    }
    const nextPalette = palette.map((color, idx) => (idx === option.index ? next : color));
    this.persist({ [option.key]: nextPalette } as PersistentConfig);
  }

  private changeColorChannel(option: Extract<SettingItem, { type: 'color' }>, direction: number) {
    const current = this.getColorChannel(option.index);
    const delta = direction === 0 ? 0 : direction > 0 ? 1 : -1;
    const next = ((current + delta + 3) % 3) as 0 | 1 | 2;
    this.colorChannelFocus[option.index] = next;
    this.draw();
  }

  private toggleColorEditMode(option: Extract<SettingItem, { type: 'color' }>) {
    if (this.isColorEditIndexActive(option.index)) {
      this.clearColorEditMode(true);
    } else {
      this.colorEditIndex = option.index;
      this.draw();
    }
  }

  private isEditingColorOption(option: SettingItem | undefined): option is Extract<SettingItem, { type: 'color' }> {
    return Boolean(option && option.type === 'color' && this.isColorEditIndexActive(option.index));
  }

  private isColorEditIndexActive(index: number) {
    return this.colorEditIndex === index;
  }

  private clearColorEditMode(redraw = false) {
    if (this.colorEditIndex !== null) {
      this.colorEditIndex = null;
      if (redraw) {
        this.draw();
      }
    }
  }

  private getColorChannel(index: number): 0 | 1 | 2 {
    if (!(index in this.colorChannelFocus)) {
      this.colorChannelFocus[index] = 0;
    }
    return this.colorChannelFocus[index];
  }

  private moveSelection(delta: number) {
    const items = this.getCurrentItems();
    if (items.length === 0 || !this.tabHasSelectableSettings(this.currentTabIndex)) {
      return;
    }
    this.tabFocus = false;
    let next = this.selectionIndex;
    for (let i = 0; i < items.length; i += 1) {
      next = (next + delta + items.length) % items.length;
      if (items[next].type !== 'label') {
        this.clearColorEditMode();
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
    this.clearColorEditMode();
    const normalized = ((index % SETTINGS_TABS.length) + SETTINGS_TABS.length) % SETTINGS_TABS.length;
    this.currentTabIndex = normalized;
    const tab = this.getCurrentTab();
    if (tab.subTabs && tab.subTabs.length > 0) {
      this.getSubTabIndexForKey(tab.key, tab.subTabs.length);
    }
    const items = this.getItemsForTab(normalized);
    if (items.length === 0) {
      this.selectionIndex = 0;
    } else {
      const first = this.getFirstSelectableIndex(normalized);
      this.selectionIndex = first < items.length ? first : 0;
    }
    if (options?.focusMode === 'tabs') {
      this.tabFocus = true;
      this.subTabFocus = false;
      this.sectionFocus = false;
    } else if (options?.focusMode === 'content') {
      this.tabFocus = false;
      this.subTabFocus = false;
      this.sectionFocus = false;
    } else if (!this.tabHasSelectableSettings(normalized)) {
      this.tabFocus = true;
      this.subTabFocus = false;
      this.sectionFocus = false;
    } else {
      this.tabFocus = false;
      this.subTabFocus = false;
      this.sectionFocus = false;
    }
    this.message = null;
    this.draw();
  }

  private getCurrentItems(): SettingItem[] {
    return this.getItemsForTab(this.currentTabIndex);
  }

  private getItemsForTab(tabIndex: number): SettingItem[] {
    const tab = SETTINGS_TABS[tabIndex];
    if (!tab) {
      return [];
    }
    if (tab.subTabs && tab.subTabs.length > 0) {
      const subIdx = this.getSubTabIndexForKey(tab.key, tab.subTabs.length);
      const subTab = tab.subTabs[subIdx];
      if (subTab?.sections && subTab.sections.length > 0) {
        const sectionIdx = this.getSectionIndexForKey(tab.key, subTab.key, subTab.sections.length);
        return subTab.sections[sectionIdx]?.items ?? [];
      }
      return subTab?.items ?? [];
    }
    return tab.items ?? [];
  }

  private hasSubTabs(tab: SettingsTab = this.getCurrentTab()) {
    return Boolean(tab.subTabs && tab.subTabs.length > 0);
  }

  private getCurrentSubTab(): SettingsSubTab | null {
    const tab = this.getCurrentTab();
    if (!tab.subTabs || tab.subTabs.length === 0) {
      return null;
    }
    const index = this.getSubTabIndexForKey(tab.key, tab.subTabs.length);
    return tab.subTabs[index] ?? null;
  }

  private getCurrentSections(): SettingsSection[] {
    const subTab = this.getCurrentSubTab();
    return subTab?.sections ?? [];
  }

  private hasSections(subTab: SettingsSubTab | null = this.getCurrentSubTab()) {
    return Boolean(subTab && subTab.sections && subTab.sections.length > 0);
  }

  private getCurrentSectionIndex() {
    const tab = this.getCurrentTab();
    const subTab = this.getCurrentSubTab();
    if (!tab || !subTab || !subTab.sections || subTab.sections.length === 0) {
      return 0;
    }
    return this.getSectionIndexForKey(tab.key, subTab.key, subTab.sections.length);
  }

  private getCurrentSubTabIndex() {
    const tab = this.getCurrentTab();
    if (!tab.subTabs || tab.subTabs.length === 0) {
      return 0;
    }
    return this.getSubTabIndexForKey(tab.key, tab.subTabs.length);
  }

  private changeSubTab(delta: number) {
    this.clearColorEditMode();
    const tab = this.getCurrentTab();
    const subTabs = tab.subTabs ?? [];
    if (subTabs.length === 0) return;
    const next = (this.getCurrentSubTabIndex() + delta + subTabs.length) % subTabs.length;
    this.subTabIndices[tab.key] = next;
    const subTab = subTabs[next];
    if (subTab?.sections && subTab.sections.length > 0) {
      this.getSectionIndexForKey(tab.key, subTab.key, subTab.sections.length);
    }
    this.selectionIndex = this.getFirstSelectableIndex(this.currentTabIndex);
    this.tabFocus = false;
    this.sectionFocus = false;
    this.message = null;
    this.draw();
  }

  private selectSubTab(index: number) {
    this.clearColorEditMode();
    const tab = this.getCurrentTab();
    const subTabs = tab.subTabs ?? [];
    if (subTabs.length === 0) return;
    const clamped = Math.max(0, Math.min(index, subTabs.length - 1));
    this.subTabIndices[tab.key] = clamped;
    const subTab = subTabs[clamped];
    if (subTab?.sections && subTab.sections.length > 0) {
      this.getSectionIndexForKey(tab.key, subTab.key, subTab.sections.length);
    }
    this.tabFocus = false;
    this.subTabFocus = false;
    this.selectionIndex = this.getFirstSelectableIndex(this.currentTabIndex);
    this.message = null;
    this.draw();
  }

  private getSubTabIndexForKey(key: SettingsTabKey, count: number) {
    if (count <= 0) {
      delete this.subTabIndices[key];
      return 0;
    }
    const saved = this.subTabIndices[key];
    const normalized = typeof saved === 'number' && saved >= 0 && saved < count ? saved : 0;
    this.subTabIndices[key] = normalized;
    return normalized;
  }

  private changeSection(delta: number) {
    this.clearColorEditMode();
    const tab = this.getCurrentTab();
    const subTab = this.getCurrentSubTab();
    const sections = subTab?.sections ?? [];
    if (!tab || !subTab || sections.length === 0) return;
    const next = (this.getCurrentSectionIndex() + delta + sections.length) % sections.length;
    this.setSectionIndex(tab.key, subTab.key, next, sections.length);
    this.selectionIndex = this.getFirstSelectableIndex(this.currentTabIndex);
    this.tabFocus = false;
    this.subTabFocus = false;
    this.message = null;
    this.draw();
  }

  private selectSection(index: number) {
    this.clearColorEditMode();
    const tab = this.getCurrentTab();
    const subTab = this.getCurrentSubTab();
    const sections = subTab?.sections ?? [];
    if (!tab || !subTab || sections.length === 0) return;
    const clamped = Math.max(0, Math.min(index, sections.length - 1));
    this.setSectionIndex(tab.key, subTab.key, clamped, sections.length);
    this.sectionFocus = false;
    this.selectionIndex = this.getFirstSelectableIndex(this.currentTabIndex);
    this.message = null;
    this.draw();
  }

  private getSectionIndexForKey(tabKey: SettingsTabKey, subKey: string, count: number) {
    if (count <= 0) {
      delete this.sectionIndices[this.getSectionStorageKey(tabKey, subKey)];
      return 0;
    }
    const key = this.getSectionStorageKey(tabKey, subKey);
    const saved = this.sectionIndices[key];
    const normalized = typeof saved === 'number' && saved >= 0 && saved < count ? saved : 0;
    this.sectionIndices[key] = normalized;
    return normalized;
  }

  private setSectionIndex(tabKey: SettingsTabKey, subKey: string, value: number, count: number) {
    if (count <= 0) {
      delete this.sectionIndices[this.getSectionStorageKey(tabKey, subKey)];
      return;
    }
    const normalized = ((value % count) + count) % count;
    this.sectionIndices[this.getSectionStorageKey(tabKey, subKey)] = normalized;
  }

  private getSectionStorageKey(tabKey: SettingsTabKey, subKey: string) {
    return `${tabKey}:${subKey}`;
  }

  private getFirstSelectableIndex(tabIndex: number) {
    const items = this.getItemsForTab(tabIndex);
    const idx = items.findIndex((item) => item.type !== 'label');
    return idx === -1 ? 0 : idx;
  }

  private tabHasSelectableSettings(tabIndex: number) {
    const items = this.getItemsForTab(tabIndex);
    return items.some((item) => item.type !== 'label');
  }
}

function clampNumber(value: number, min: number, max: number, decimals: number) {
  const clamped = Math.max(min, Math.min(max, value));
  const factor = Math.pow(10, decimals);
  return Math.round(clamped * factor) / factor;
}

