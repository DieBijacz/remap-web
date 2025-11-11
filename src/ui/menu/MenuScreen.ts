import type { Action } from '../../input/Keymap';
import type { Config as PersistentConfig } from '../../storage/ConfigStore';
import { clearCanvas, pointInRect } from '../canvasUtils';
import {
  drawSymbol,
  SYMBOL_THEME_SETS,
  type Symbol,
  type SymbolTheme,
  type SymbolType
} from '../../render/Symbols';
import {
  DEFAULT_SYMBOL_COLORS,
  cloneColor,
  sanitizeSymbolColors,
  type RGBColor
} from '../../config/colorPresets';

export interface MenuActions {
  onStart: () => void;
}

type MenuSymbol = Symbol & {
  vx: number;
  vy: number;
  rotationSpeed: number;
  startScale: number;
  endScale: number;
  life: number;
  age: number;
  exitMargin: number;
};

type MenuVisualConfig = {
  symbolTheme: SymbolTheme;
  menuSymbolCount: number;
  menuSymbolBaseSizeVW: number;
  menuSymbolSizeVariancePct: number;
  menuSymbolGrowthMultiplier: number;
};

const MIN_SYMBOLS = 4;
const MAX_SYMBOLS = 60;
const SYMBOL_BASE_SIZE = 46;

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const randBetween = (min: number, max: number) => Math.random() * (max - min) + min;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export class MenuScreen {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private animationFrame: number | null = null;
  private lastTimestamp = 0;
  private active = false;
  private startLabelRect: DOMRect | null = null;
  private pulseTime = 0;
  private symbols: MenuSymbol[] = [];
  private visualConfig: MenuVisualConfig = {
    symbolTheme: 'classic',
    menuSymbolCount: 24,
    menuSymbolBaseSizeVW: 6,
    menuSymbolSizeVariancePct: 30,
    menuSymbolGrowthMultiplier: 4.5
  };
  private colorPool: RGBColor[] = DEFAULT_SYMBOL_COLORS.map(cloneColor);

  constructor(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D) {
    this.canvas = canvas;
    this.ctx = ctx;
  }

  setConfig(values: PersistentConfig) {
    const nextTheme: SymbolTheme = values.symbolTheme === 'pacman' ? 'pacman' : 'classic';
    const rawCount = typeof values.menuSymbolCount === 'number' ? values.menuSymbolCount : this.visualConfig.menuSymbolCount;
    const nextCount = clamp(Math.round(rawCount ?? 24), MIN_SYMBOLS, MAX_SYMBOLS);
    const themeChanged = nextTheme !== this.visualConfig.symbolTheme;
    this.colorPool = sanitizeSymbolColors(values.symbolColors);
    this.visualConfig = {
      symbolTheme: nextTheme,
      menuSymbolCount: nextCount,
      menuSymbolBaseSizeVW: clamp(
        typeof values.menuSymbolBaseSizeVW === 'number' ? values.menuSymbolBaseSizeVW : this.visualConfig.menuSymbolBaseSizeVW,
        0.5,
        20
      ),
      menuSymbolSizeVariancePct: clamp(
        typeof values.menuSymbolSizeVariancePct === 'number'
          ? values.menuSymbolSizeVariancePct
          : this.visualConfig.menuSymbolSizeVariancePct,
        0,
        100
      ),
      menuSymbolGrowthMultiplier: clamp(
        typeof values.menuSymbolGrowthMultiplier === 'number'
          ? values.menuSymbolGrowthMultiplier
          : this.visualConfig.menuSymbolGrowthMultiplier,
        1,
        30
      )
    };
    this.symbols = [];
  }

  enter() {
    if (this.active) {
      return;
    }
    this.active = true;
    this.lastTimestamp = performance.now();
    this.tick(0);
    this.animationFrame = requestAnimationFrame(this.loop);
  }

  exit() {
    this.active = false;
    this.startLabelRect = null;
    this.pulseTime = 0;
    this.lastTimestamp = 0;
    if (this.animationFrame != null) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = null;
    }
    this.symbols = [];
  }

  draw() {
    // Backwards compatibility for legacy calls
    this.enter();
  }

  handleAction(action: Action, actions: MenuActions): boolean {
    if (action === 'confirm') {
      actions.onStart();
      return true;
    }
    return false;
  }

  handleClick(x: number, y: number, actions: MenuActions): boolean {
    if (pointInRect(x, y, this.startLabelRect)) {
      actions.onStart();
      return true;
    }
    return false;
  }

  private loop = (timestamp: number) => {
    if (!this.active) {
      this.animationFrame = null;
      return;
    }
    const delta = this.lastTimestamp ? (timestamp - this.lastTimestamp) / 1000 : 0;
    const dt = clamp(delta, 0, 0.12);
    this.lastTimestamp = timestamp;
    this.pulseTime += dt;
    this.tick(dt);
    this.animationFrame = requestAnimationFrame(this.loop);
  };

  private tick(dt: number) {
    const width = this.canvas.clientWidth || this.canvas.width;
    const height = this.canvas.clientHeight || this.canvas.height;
    if (!width || !height) {
      return;
    }
    this.updateSymbols(dt, width, height);
    this.ensureSymbolQuota(width, height);
    this.render(width, height);
  }

  private ensureSymbolQuota(width: number, height: number) {
    const desired = clamp(Math.round(this.visualConfig.menuSymbolCount), MIN_SYMBOLS, MAX_SYMBOLS);
    while (this.symbols.length < desired) {
      this.symbols.push(this.createSymbol(width, height));
    }
    if (this.symbols.length > desired) {
      this.symbols.splice(0, this.symbols.length - desired);
    }
  }

  private pickSymbolColor(): RGBColor {
    const pool = this.colorPool.length > 0 ? this.colorPool : DEFAULT_SYMBOL_COLORS;
    const idx = Math.floor(Math.random() * pool.length);
    const color = pool[idx] ?? DEFAULT_SYMBOL_COLORS[0];
    return cloneColor(color);
  }

  private updateSymbols(dt: number, width: number, height: number) {
    const fallbackMargin = Math.max(width, height) * 0.35 + 80;
    this.symbols = this.symbols
      .map((symbol) => ({
        ...symbol,
        x: symbol.x + symbol.vx * dt,
        y: symbol.y + symbol.vy * dt,
        rotation: symbol.rotation + symbol.rotationSpeed * dt,
        age: symbol.age + dt,
        scale: lerp(symbol.startScale, symbol.endScale, Math.min(1, (symbol.age + dt) / symbol.life))
      }))
      .filter((symbol) => {
        const margin = symbol.exitMargin ?? fallbackMargin;
        const buffer = symbol.scale * 50;
        const fullyAbove = symbol.y + buffer < -margin;
        const offLeft = symbol.x + buffer < -margin;
        const offRight = symbol.x - buffer > width + margin;
        const expired = symbol.age > symbol.life + 1.5;
        return !(expired || fullyAbove || offLeft || offRight);
      });
  }

  private render(width: number, height: number) {
    clearCanvas(this.canvas, this.ctx);
    this.startLabelRect = null;
    this.drawBackdrop(width, height);
    this.drawSymbols();
    this.drawTitleBlock(width, height);
  }

  private drawBackdrop(width: number, height: number) {
    const { ctx } = this;
    ctx.save();
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, '#050c1a');
    gradient.addColorStop(1, '#02050b');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    const centerX = width / 2;
    const centerY = height / 2;
    const radius = Math.max(width, height) * 0.85;
    const vignette = ctx.createRadialGradient(centerX, centerY, radius * 0.2, centerX, centerY, radius);
    vignette.addColorStop(0, 'rgba(0, 0, 0, 0)');
    vignette.addColorStop(1, 'rgba(0, 0, 0, 0.55)');
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
  }

  private drawSymbols() {
    const { ctx } = this;
    ctx.save();
    this.symbols.forEach((symbol) => {
      drawSymbol(ctx, symbol, false, 0.7);
    });
    ctx.restore();
  }

  private drawTitleBlock(width: number, height: number) {
    const { ctx } = this;
    const titleText = 'REMAP';
    const titleSize = Math.max(48, Math.round(height * 0.14));
    const titleX = width / 2;
    const titleY = Math.round(height * 0.28);

    ctx.save();
    ctx.font = `${titleSize}px Orbitron, sans-serif`;
    ctx.fillStyle = '#f8fafc';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowBlur = Math.max(12, titleSize * 0.15);
    ctx.shadowColor = 'rgba(3, 6, 12, 0.75)';
    ctx.fillText(titleText, titleX, titleY);
    ctx.restore();

    const labelText = 'start game';
    const labelSize = Math.max(18, Math.round(titleSize * 0.28));
    const labelY = titleY + titleSize * 0.65;
    const pulse = (Math.sin(this.pulseTime * 2.2) + 1) / 2;
    const labelAlpha = 0.5 + pulse * 0.5;

    ctx.save();
    ctx.font = `${labelSize}px Orbitron, sans-serif`;
    ctx.fillStyle = `rgba(126, 231, 135, ${labelAlpha})`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
    ctx.shadowBlur = labelSize * 0.9;
    ctx.fillText(labelText, titleX, labelY);
    const metrics = ctx.measureText(labelText);
    const paddingX = Math.max(24, labelSize);
    const paddingY = Math.max(12, labelSize * 0.6);
    const rectX = titleX - metrics.width / 2 - paddingX / 2;
    const rectY = labelY - paddingY * 0.3;
    const rectWidth = metrics.width + paddingX;
    const rectHeight = labelSize + paddingY;
    this.startLabelRect = new DOMRect(rectX, rectY, rectWidth, rectHeight);
    ctx.strokeStyle = `rgba(126, 231, 135, ${0.25 + pulse * 0.5})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(rectX, rectY + rectHeight);
    ctx.lineTo(rectX + rectWidth, rectY + rectHeight);
    ctx.stroke();
    ctx.restore();
  }

  private createSymbol(width: number, height: number): MenuSymbol {
    const themeSet = SYMBOL_THEME_SETS[this.visualConfig.symbolTheme] ?? SYMBOL_THEME_SETS.classic;
    const symbolType = themeSet[Math.floor(Math.random() * themeSet.length)] as SymbolType;
    const overshoot = Math.max(width, height) * 0.08 + 32;
    const exitMargin = Math.max(width, height) * 0.4 + 120;
    const startX = randBetween(width * 0.05, width * 0.95);
    const startY = height + randBetween(overshoot, overshoot * 2.2);
    const verticalSpeed = randBetween(height * 0.18, height * 0.28);
    const horizontalDrift = randBetween(-width * 0.12, width * 0.12);

    const baseSizeVW = this.visualConfig.menuSymbolBaseSizeVW;
    const baseSizePx = Math.max(4, width * (baseSizeVW / 100));
    const variance = this.visualConfig.menuSymbolSizeVariancePct / 100;
    const jitter = variance > 0 ? randBetween(-variance, variance) : 0;
    const startSizePx = Math.max(6, baseSizePx * (1 + jitter));
    const startScale = Math.max(0.05, startSizePx / SYMBOL_BASE_SIZE);

    const minGrowth = 1.05;
    const growthMax = Math.max(minGrowth, this.visualConfig.menuSymbolGrowthMultiplier);
    const growthMultiplier = growthMax === minGrowth ? minGrowth : randBetween(minGrowth, growthMax);
    const endScale = Math.max(startScale * growthMultiplier, startScale + 0.05);

    const travelDistance = startY + exitMargin + endScale * 50;
    const life = Math.max(2.5, travelDistance / verticalSpeed);
    const rotationSpeed = randBetween(-2.2, 2.2);

    return {
      type: symbolType,
      x: startX,
      y: startY,
      vx: horizontalDrift,
      vy: -verticalSpeed,
      rotation: randBetween(0, Math.PI * 2),
      rotationSpeed,
      scale: startScale,
      startScale,
      endScale,
      life,
      age: 0,
      exitMargin,
      color: this.pickSymbolColor()
    };
  }
}
