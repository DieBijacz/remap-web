import { Clock, PausableTime } from '../core/Clock';
import { Renderer2D } from '../render/Renderer2D';
import { AnimationTimeline, easeOutCubic } from '../core/Animation';
import { Timer } from '../core/Timer';
import { drawSymbol, SYMBOL_PALETTES } from '../render/Symbols';
import type { Symbol, SymbolType } from '../render/Symbols';
import type { InputHandler } from '../input/InputManager';
import { InputManager } from '../input/InputManager';
import { EffectsManager } from '../fx/EffectsManager';
import { ParticleSystem } from '../fx/ParticleSystem';
import { AudioManager } from '../audio/AudioManager';
import correctSfxUrl from '../audio/sfx/sfx_point.wav';
import wrongSfxUrl from '../audio/sfx/sfx_wrong.wav';
import HighscoreStore from '../storage/HighscoreStore';
import ConfigStore from '../storage/ConfigStore';
import type { Config as PersistentConfig } from '../storage/ConfigStore';

const RING_SYMBOL_TYPES: SymbolType[] = ['triangle', 'square', 'circle', 'cross'];
const BASE_RING_SYMBOL_SCALE = 1.22;
const BASE_CENTER_SCALE = 1.85;
const CENTER_MIN_RATIO = 0.4;
const TIME_DELTA_DISPLAY_SEC = 1.1;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const TAU = Math.PI * 2;
const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeInOutCubicDerivative = (t: number) => (t < 0.5 ? 12 * t * t : 12 * Math.pow(1 - t, 2));
type Direction = 'up' | 'right' | 'down' | 'left';
type MechanicType = 'none' | 'remap' | 'spin' | 'memory' | 'joystick';
const MECHANIC_SEQUENCE: MechanicType[] = ['none', 'remap', 'spin', 'memory', 'joystick'];
const MECHANIC_INTERVAL = 10;
const MEMORY_PREVIEW_DURATION = 1.0;
const RING_BASE_ANGLES = [-Math.PI / 2, Math.PI, 0, Math.PI / 2];
const MECHANIC_COLORS: Record<MechanicType, string> = {
  none: '#9da7b3',
  remap: '#ec4899',
  spin: '#fbbf24',
  memory: '#f87171',
  joystick: '#34d399'
};

type RingSegment = { start: number; end: number; };
interface RingStyle {
  radiusScale: number;
  thickness: number;
  segments: RingSegment[];
  rotationScale?: number;
  rotationOffset?: number;
  color?: string;
  glow?: number;
  opacity?: number;
}

const hexToRgb = (hex: string) => {
  const normalized = hex.replace('#', '');
  const value = normalized.length === 3
    ? normalized.split('').map((ch) => ch + ch).join('')
    : normalized.padStart(6, '0');
  const numeric = parseInt(value, 16);
  return {
    r: (numeric >> 16) & 255,
    g: (numeric >> 8) & 255,
    b: numeric & 255
  };
};

const colorWithAlpha = (hex: string, alpha: number, brighten = 0) => {
  const { r, g, b } = hexToRgb(hex);
  const mix = Math.max(0, Math.min(1, brighten));
  const rr = Math.round(r + (255 - r) * mix);
  const gg = Math.round(g + (255 - g) * mix);
  const bb = Math.round(b + (255 - b) * mix);
  return `rgba(${rr}, ${gg}, ${bb}, ${alpha})`;
};

const makeSegments = (...ranges: Array<[number, number]>) =>
  ranges.map(([start, end]) => ({ start, end }));

const MECHANIC_RING_STYLES: Record<MechanicType, RingStyle[]> = {
  none: [],
  remap: [
    {
      radiusScale: 1.02,
      thickness: 4.6,
      glow: 18,
      segments: makeSegments([0.02, 0.26], [0.52, 0.76])
    }
  ],
  spin: [
    {
      radiusScale: 1.12,
      thickness: 3.8,
      glow: 14,
      segments: makeSegments(
        [0.0, 0.08],
        [0.17, 0.25],
        [0.34, 0.42],
        [0.51, 0.59],
        [0.68, 0.76],
        [0.85, 0.93]
      )
    }
  ],
  memory: [
    {
      radiusScale: 0.94,
      thickness: 3.5,
      glow: 16,
      segments: makeSegments([0.08, 0.86])
    }
  ],
  joystick: [
    {
      radiusScale: 1.18,
      thickness: 3.2,
      glow: 12,
      segments: makeSegments(
        [0.11, 0.2],
        [0.38, 0.47],
        [0.64, 0.73],
        [0.91, 1.0]
      )
    }
  ]
};

const MECHANIC_RING_SPEED: Record<MechanicType, number> = {
  none: 0,
  remap: 0.4,
  spin: 1.45,
  memory: 0.32,
  joystick: 0.6
};

interface SpinState {
  active: boolean;
  elapsed: number;
  duration: number;
  swapAt: number;
  swapDone: boolean;
  targetTypes: SymbolType[];
  startRotation: number;
  targetRotation: number;
  spins: number;
  velocity: number;
}

interface GameConfig {
  duration: number;        // Game duration in seconds
  timePenalty: number;     // Time lost on wrong answer
  symbolCount: number;     // Number of symbols to display
  maxTimeBonus: number;    // Maximum extra time rewarded
  minTimeBonus: number;    // Minimum extra time rewarded
  bonusWindow: number;     // Seconds window for full bonus
  ringRadiusFactor: number;// Relative radius of outer ring
  symbolScale: number;
  symbolStroke: number;
}

export class Game implements InputHandler {
  private clock = new Clock();
  private time = new PausableTime();
  private renderer: Renderer2D;
  private anim = new AnimationTimeline();
  private input: InputManager;
  private effects: EffectsManager;
  private particles = new ParticleSystem();
  private audio: AudioManager;
  private score = 0;
  private streak = 0;
  private highscore = 0;
  private highscoreStore: HighscoreStore | null = null;
  private readonly defaults: GameConfig = {
    duration: 60,
    timePenalty: 2,
    symbolCount: 4,
    maxTimeBonus: 3,
    minTimeBonus: 0.5,
    bonusWindow: 2.5,
    ringRadiusFactor: 0.18,
    symbolScale: 1,
    symbolStroke: 1
  };
  private timeDeltaValue = 0;
  private timeDeltaTimer = 0;
  private config: GameConfig = {
    duration: 60,
    timePenalty: 2,
    symbolCount: 4,
    maxTimeBonus: 3,
    minTimeBonus: 0.5,
    bonusWindow: 2.5,
    ringRadiusFactor: 0.18,
    symbolScale: 1,
    symbolStroke: 1
  };

  private timer: Timer;
  private symbols: Symbol[] = [];
  private currentTargetIndex = 0;
  private centerSymbol: SymbolType = 'triangle';
  private centerPos = { x: 0, y: 0 };
  private ringSymbolScale = BASE_RING_SYMBOL_SCALE;
  private centerBaseScale = BASE_CENTER_SCALE;
  private centerMinScale = BASE_CENTER_SCALE * CENTER_MIN_RATIO;
  private centerScale = BASE_CENTER_SCALE;
  private symbolStrokeScale = 1;
  private centerOpacity = 1;
  private promptSpawnTime = 0;
  private isGameOver = false;
  private configStore: ConfigStore | null = null;
  private correctAnswers = 0;
  private currentMechanicBlock = 0;
  private mechanicInterval = MECHANIC_INTERVAL;
  private mechanicRandomize = false;
  private activeMechanic: MechanicType = 'none';
  private mechanicBannerText: string | null = null;
  private remapMapping: { from: SymbolType; to: SymbolType } | null = null;
  private memoryRevealTimer = 0;
  private memorySymbolsHidden = false;
  private joystickInverted = false;
  private ringRotationOffset = 0;
  private spinState: SpinState | null = null;
  private lastRandomMechanic: MechanicType = 'none';
  private particleDensity = 4;
  private particlesEnabled = true;
  private particlesPersist = false;
  private mechanicRingAngles: Record<MechanicType, number> = {
    none: 0,
    remap: 0,
    spin: 0,
    memory: 0,
    joystick: 0
  };

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new Renderer2D(canvas);
    this.timer = new Timer(this.config.duration, this.time);
    this.input = new InputManager();
    this.effects = new EffectsManager();
    this.audio = new AudioManager();
    this.config = { ...this.defaults };
    if (typeof window !== 'undefined' && 'localStorage' in window) {
      this.highscoreStore = new HighscoreStore();
      this.configStore = new ConfigStore();
      this.syncHighscore();
      this.refreshSettings();
    }

    // Register for input events
    this.input.addHandler(this);

    // Load audio
    this.loadAudio();
  }

  private async loadAudio() {
    await Promise.all([
      this.audio.load('correct', correctSfxUrl, 0.5),
      this.audio.load('wrong', wrongSfxUrl, 0.3),
      this.audio.load('gameover', '/sounds/gameover.mp3', 0.6)
    ]);
  }

  private getRandomSymbolType(...excludes: (SymbolType | undefined)[]): SymbolType {
    const pool = (this.symbols.length > 0 ? this.symbols.map((s) => s.type) : RING_SYMBOL_TYPES);
    const excludeSet = new Set<SymbolType>(excludes.filter((x): x is SymbolType => !!x));
    const filtered = pool.filter((type) => !excludeSet.has(type));
    const candidates = filtered.length > 0 ? filtered : pool;
    if (candidates.length === 0) {
      return this.centerSymbol;
    }
    return this.randomChoice(candidates, this.centerSymbol);
  }

  private randomChoice<T>(items: T[], fallback: T): T {
    if (items.length === 0) {
      return fallback;
    }
    const idx = Math.floor(Math.random() * items.length);
    return items[idx] ?? fallback;
  }

  private shuffleArray<T>(source: T[]): T[] {
    const copy = [...source];
    for (let i = copy.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  private rollRandomMechanic(exclude?: MechanicType): MechanicType {
    const pool: MechanicType[] = ['remap', 'spin', 'memory', 'joystick'];
    const filtered = pool.filter((mechanic) => mechanic !== exclude);
    const candidates = filtered.length > 0 ? filtered : pool;
    return this.randomChoice<MechanicType>(candidates, candidates[0] ?? 'remap');
  }

  private applyDefaultRingOrder() {
    if (this.symbols.length === 0) return;
    this.ringRotationOffset = 0;
      RING_SYMBOL_TYPES.forEach((type, index) => {
        const symbol = this.symbols[index];
        if (symbol) {
          symbol.type = type;
          symbol.scale = this.ringSymbolScale;
          symbol.rotation = 0;
        }
      });
    this.updateRingLayout();
  }

  private applySpinShuffle(opts?: { animate?: boolean }) {
    if (this.symbols.length === 0) return;
    const currentTypes = this.symbols.map((symbol) => symbol.type);
    const shuffledTypes = this.shuffleArray(currentTypes);
    const animate = opts?.animate !== false;
    if (animate) {
      this.startSpinAnimation(shuffledTypes);
      return;
    }
    this.cancelSpinAnimation(0);
      this.symbols.forEach((symbol, index) => {
        symbol.type = shuffledTypes[index] ?? symbol.type;
        symbol.scale = this.ringSymbolScale;
        symbol.rotation = 0;
      });
    this.updateRingLayout();
  }

  private startSpinAnimation(targetTypes: SymbolType[]) {
    if (this.symbols.length === 0) return;
    const duration = 0.9;
    const spins = 2.0;
    const startRotation = this.ringRotationOffset % TAU;
    const targetRotation = startRotation + TAU * spins;
    const state: SpinState = {
      active: true,
      elapsed: 0,
      duration,
      swapAt: 0.5,
      swapDone: false,
      targetTypes,
      startRotation,
      targetRotation,
      spins,
      velocity: 0
    };
    this.spinState = state;
  }

  private cancelSpinAnimation(finalRotation?: number) {
    const final = typeof finalRotation === 'number' ? finalRotation : this.ringRotationOffset;
    this.ringRotationOffset = ((final % TAU) + TAU) % TAU;
    this.spinState = null;
    this.updateRingLayout();
  }

  private updateSpinAnimation(dt: number) {
    if (!this.spinState || !this.spinState.active) return;
    const state = this.spinState;
    state.elapsed = Math.min(state.duration, state.elapsed + dt);
    const progress = clamp(state.elapsed / state.duration, 0, 1);
    const eased = easeInOutCubic(progress);
    const rotation = state.startRotation + (state.targetRotation - state.startRotation) * eased;
    this.ringRotationOffset = rotation;
    this.updateRingLayout();

    const derivative = easeInOutCubicDerivative(progress);
    const angularVelocity = (state.targetRotation - state.startRotation) * derivative / state.duration;
    state.velocity = angularVelocity;

    if (!state.swapDone && progress >= state.swapAt) {
      this.symbols.forEach((symbol, index) => {
        symbol.type = state.targetTypes[index] ?? symbol.type;
      });
      state.swapDone = true;
    }

    if (progress >= 1) {
      this.cancelSpinAnimation(rotation);
    }
  }

  private getActiveMechanics(): MechanicType[] {
    if (this.activeMechanic === 'none') {
      return [];
    }
    return [this.activeMechanic];
  }

  private updateMechanicRings(dt: number) {
    const active = this.getActiveMechanics();
    active.forEach((type) => {
      const speed = MECHANIC_RING_SPEED[type] ?? 0;
      if (speed === 0) return;
      this.mechanicRingAngles[type] = ((this.mechanicRingAngles[type] ?? 0) + speed * dt) % TAU;
    });
  }

  private rollRemapMapping() {
    const availableSet = this.symbols.length > 0 ? this.symbols.map((s) => s.type) : [...RING_SYMBOL_TYPES];
    const uniqueAvailable = Array.from(new Set(availableSet));
    if (uniqueAvailable.length < 2) {
      this.remapMapping = null;
      this.mechanicBannerText = 'Remap Pause';
      return;
    }

    const excludeCurrent = this.remapMapping?.from;
    const sourcePool = uniqueAvailable.filter((sym) => sym !== excludeCurrent);
    const from = this.randomChoice(sourcePool.length > 0 ? sourcePool : uniqueAvailable, uniqueAvailable[0]);

    const targetPool = uniqueAvailable.filter((sym) => sym !== from);
    const fallbackTarget = targetPool[0] ?? uniqueAvailable[0];
    let to = this.randomChoice(targetPool.length > 0 ? targetPool : uniqueAvailable.filter((sym) => sym !== from), fallbackTarget);
    if (to === from) {
      const alternative = uniqueAvailable.find((sym) => sym !== from);
      if (alternative) {
        to = alternative;
      }
    }

    this.remapMapping = { from, to };
    this.mechanicBannerText = null;
  }

  private getExpectedSymbolType(): SymbolType {
    if (this.activeMechanic === 'remap' && this.remapMapping) {
      if (this.centerSymbol === this.remapMapping.from) {
        return this.remapMapping.to;
      }
    }
    return this.centerSymbol;
  }

  private mapInputDirection(dir: Direction): Direction {
    if (!this.joystickInverted) {
      return dir;
    }
    switch (dir) {
      case 'left': return 'right';
      case 'right': return 'left';
      case 'up': return 'down';
      case 'down': return 'up';
      default: return dir;
    }
  }

  private ensureMemoryMessage() {
    if (this.activeMechanic !== 'memory') {
      return;
    }
    const expected = this.memorySymbolsHidden ? 'Memory Recall' : 'Memory Prep';
    if (this.mechanicBannerText !== expected) {
      this.mechanicBannerText = expected;
    }
  }

  private triggerMechanicFlash(type: MechanicType) {
    if (type === 'none') return;
    const color = MECHANIC_COLORS[type] ?? MECHANIC_COLORS.none;
    this.effects.flash(colorWithAlpha(color, 1), 0.24, 0.22);
  }

  private enterMechanic(next: MechanicType) {
    if (next !== 'remap') {
      this.remapMapping = null;
    }
    if (next !== 'joystick') {
      this.joystickInverted = false;
    }
    if (next !== 'memory') {
      this.memorySymbolsHidden = false;
      this.memoryRevealTimer = 0;
    }
    if (next !== 'spin') {
      this.cancelSpinAnimation(0);
    }

    this.activeMechanic = next;

    switch (next) {
      case 'none':
        this.mechanicBannerText = null;
        this.applyDefaultRingOrder();
        break;
      case 'remap':
        this.mechanicBannerText = null;
        this.applyDefaultRingOrder();
        this.rollRemapMapping();
        break;
      case 'spin':
        this.mechanicBannerText = 'Spin Mode';
        this.applySpinShuffle();
        break;
      case 'memory':
        this.memorySymbolsHidden = false;
        this.memoryRevealTimer = MEMORY_PREVIEW_DURATION;
        this.applySpinShuffle();
        this.mechanicBannerText = 'Memory Prep';
        this.ensureMemoryMessage();
        break;
      case 'joystick':
        this.joystickInverted = true;
        this.applyDefaultRingOrder();
        this.mechanicBannerText = 'Joystick Flip';
        break;
      default:
        this.mechanicBannerText = null;
        break;
    }

    if (next !== 'none') {
      this.triggerMechanicFlash(next);
    }
  }

  private refreshMechanic(mechanic: MechanicType) {
    switch (mechanic) {
      case 'remap':
        this.rollRemapMapping();
        break;
      case 'spin':
        this.mechanicBannerText = 'Spin Mode';
        this.applySpinShuffle();
        break;
      case 'memory':
        if (!this.memorySymbolsHidden) {
          this.mechanicBannerText = 'Memory Prep';
        }
        if (this.memorySymbolsHidden) {
          this.ensureMemoryMessage();
        }
        break;
      default:
        break;
    }
  }

  private updateMechanicsAfterCorrect() {
    if (this.mechanicInterval <= 0) {
      return;
    }
    const newBlock = Math.floor(this.correctAnswers / this.mechanicInterval);
    let nextMechanic = this.activeMechanic;

    if (newBlock !== this.currentMechanicBlock) {
      if (newBlock <= 0) {
        nextMechanic = 'none';
      } else if (this.mechanicRandomize) {
        nextMechanic = this.rollRandomMechanic(this.lastRandomMechanic);
      } else {
        nextMechanic = MECHANIC_SEQUENCE[newBlock % MECHANIC_SEQUENCE.length];
      }
    }

    if (nextMechanic !== 'none') {
      this.lastRandomMechanic = nextMechanic;
    }

    if (newBlock !== this.currentMechanicBlock || nextMechanic !== this.activeMechanic) {
      this.currentMechanicBlock = newBlock;
      this.enterMechanic(nextMechanic);
    } else {
      this.refreshMechanic(this.activeMechanic);
    }
  }

  private reapplyActiveMechanicLayout() {
    switch (this.activeMechanic) {
      case 'none':
        this.applyDefaultRingOrder();
        break;
      case 'spin':
        this.applySpinShuffle();
        break;
      case 'memory':
        this.applySpinShuffle();
        this.memorySymbolsHidden = false;
        this.memoryRevealTimer = MEMORY_PREVIEW_DURATION;
        this.ensureMemoryMessage();
        break;
      default:
        break;
    }
  }

  private applyCenterSymbol(next: SymbolType, opts?: { resetVisual?: boolean }) {
    this.centerSymbol = next;
    const matchIdx = this.symbols.findIndex((symbol) => symbol.type === next);
    this.currentTargetIndex = matchIdx >= 0 ? matchIdx : 0;
    const { x: cx, y: cy } = this.getCanvasCenter();
    this.centerPos.x = cx;
    this.centerPos.y = cy;
    if (opts?.resetVisual !== false) {
      this.centerScale = this.centerBaseScale;
      this.centerOpacity = 1;
    }
  }

  private getCanvasCenter() {
    return { x: this.renderer.w / 2, y: this.renderer.h / 2 };
  }

  private syncHighscore() {
    if (!this.highscoreStore) return;
    const list = this.highscoreStore.list();
    this.highscore = list.length > 0 ? list[0] : Math.max(this.highscore, 0);
  }

  private recordScore() {
    if (!this.highscoreStore) return;
    this.highscoreStore.save(this.score);
    const list = this.highscoreStore.list();
    this.highscore = list.length > 0 ? list[0] : Math.max(this.highscore, this.score);
  }

  resetHighscore() {
    this.highscoreStore?.clear();
    this.syncHighscore();
  }

  private showTimeDelta(delta: number) {
    this.timeDeltaValue = delta;
    this.timeDeltaTimer = TIME_DELTA_DISPLAY_SEC;
  }

  refreshSettings(config?: PersistentConfig) {
    const data = config ?? this.configStore?.load() ?? {};
    const merged: GameConfig = {
      ...this.defaults,
      duration: clamp(data.initialTime ?? this.defaults.duration, 15, 300),
      timePenalty: this.defaults.timePenalty,
      symbolCount: this.defaults.symbolCount,
      maxTimeBonus: clamp(data.maxTimeBonus ?? this.defaults.maxTimeBonus, 0.5, 6),
      minTimeBonus: clamp(data.minTimeBonus ?? this.defaults.minTimeBonus, 0.1, 5),
      bonusWindow: clamp(data.bonusWindow ?? this.defaults.bonusWindow, 0.5, 6),
      ringRadiusFactor: clamp(data.ringRadiusFactor ?? this.defaults.ringRadiusFactor, 0.08, 0.3),
      symbolScale: clamp(data.symbolScale ?? this.defaults.symbolScale, 0.6, 1.6),
      symbolStroke: clamp(data.symbolStroke ?? this.defaults.symbolStroke, 0.5, 1.8)
    };
    // Ensure floor is not above ceiling
    if (merged.minTimeBonus > merged.maxTimeBonus) {
      merged.minTimeBonus = merged.maxTimeBonus;
    }
    this.config = merged;

    this.ringSymbolScale = BASE_RING_SYMBOL_SCALE * merged.symbolScale;
    this.centerBaseScale = BASE_CENTER_SCALE * merged.symbolScale;
    this.centerMinScale = this.centerBaseScale * CENTER_MIN_RATIO;
    this.centerScale = this.centerBaseScale;
    this.symbolStrokeScale = merged.symbolStroke;

    if (this.symbols.length > 0) {
      this.symbols.forEach((symbol) => {
        symbol.scale = this.ringSymbolScale;
      });
      this.updateRingLayout();
    }

    const rawInterval = typeof data.mechanicInterval === 'number' ? data.mechanicInterval : this.mechanicInterval;
    const clampedInterval = Math.max(1, Math.round(clamp(rawInterval, 1, 60)));
    const randomize = Boolean(data.mechanicRandomize ?? false);
    const intervalChanged = clampedInterval !== this.mechanicInterval;
    const randomChanged = randomize !== this.mechanicRandomize;

    this.mechanicInterval = clampedInterval;
    this.mechanicRandomize = randomize;

    if (intervalChanged || randomChanged) {
      if (randomChanged && !this.mechanicRandomize) {
        this.lastRandomMechanic = 'none';
      }
      this.updateMechanicsAfterCorrect();
    }

    const particleSetting = typeof data.particlesPerScore === 'number' ? data.particlesPerScore : this.particleDensity;
    this.particleDensity = clamp(particleSetting, 0, 20);
    const particlesEnabledSetting = data.particlesEnabled;
    this.particlesEnabled = particlesEnabledSetting !== false;
    const particlesPersistSetting = data.particlesPersist;
    this.particlesPersist = Boolean(particlesPersistSetting);
    this.particles.setDespawnEnabled(!this.particlesPersist);
    if (!this.particlesEnabled) {
      this.particles.clear();
    }
  }

  private getRingRadius() {
    return Math.round(this.renderer.w * this.config.ringRadiusFactor);
  }

  private computeRingPositions(offset = this.ringRotationOffset) {
    const { w, h } = this.renderer;
    const radius = this.getRingRadius();
    const center = { x: w / 2, y: h / 2 };
    return RING_BASE_ANGLES.map((base) => {
      const angle = base + offset;
      return {
        x: center.x + radius * Math.cos(angle),
        y: center.y + radius * Math.sin(angle)
      };
    });
  }

  private updateRingLayout() {
    const positions = this.computeRingPositions();
    positions.forEach((pos, index) => {
      const symbol = this.symbols[index];
      if (symbol) {
        symbol.x = pos.x;
        symbol.y = pos.y;
        symbol.scale = this.ringSymbolScale;
        symbol.rotation = this.ringRotationOffset;
      }
    });
  }

  private drawRingBackdrop(ctx: CanvasRenderingContext2D) {
    // Background glow removed per updated art direction.
    void ctx;
  }

  private drawMechanicRings(ctx: CanvasRenderingContext2D) {
    const active = this.getActiveMechanics();
    if (active.length === 0) {
      return;
    }
    const center = this.getCanvasCenter();
    const baseRadius = this.getRingRadius();
    active.forEach((type) => {
      const styles = MECHANIC_RING_STYLES[type] ?? [];
      if (styles.length === 0) return;
      const baseAngle = this.mechanicRingAngles[type] ?? 0;
      styles.forEach((style) => {
        const radius = baseRadius * style.radiusScale;
        const angle = baseAngle * (style.rotationScale ?? 1) + (style.rotationOffset ?? 0);
        const mechanicColor = style.color ?? MECHANIC_COLORS[type];
        const brighten = type === 'memory' && this.memorySymbolsHidden ? 0.35 : 0;
        ctx.save();
        ctx.translate(center.x, center.y);
        ctx.lineWidth = style.thickness;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.globalAlpha = style.opacity ?? 0.95;
        ctx.strokeStyle = colorWithAlpha(mechanicColor, 0.88, brighten);
        ctx.shadowColor = colorWithAlpha(mechanicColor, 0.6, brighten);
        ctx.shadowBlur = style.glow ?? 10;
        style.segments.forEach((segment) => {
          ctx.beginPath();
          ctx.arc(
            0,
            0,
            radius,
            angle + segment.start * TAU,
            angle + segment.end * TAU,
            false
          );
          ctx.stroke();
        });
        ctx.restore();
      });
    });
  }

  private recordPromptSpawn() {
    this.promptSpawnTime = this.time.get();
  }

  private computeTimeBonus() {
    const maxBonus = Math.max(0, this.config.maxTimeBonus);
    if (maxBonus <= 0) return 0;
    const floor = clamp(this.config.minTimeBonus, 0, maxBonus);
    const window = Math.max(0.0001, this.config.bonusWindow);
    const reaction = Math.max(0, this.time.get() - this.promptSpawnTime);
    const ratio = clamp(1 - reaction / window, 0, 1);
    return clamp(floor + (maxBonus - floor) * ratio, floor, maxBonus);
  }

  private animateCenterSwap(next: SymbolType, options?: {
    targetPos?: { x: number; y: number };
    exitDuration?: number;
    appearDuration?: number;
    offsetRatio?: number;
    disappearScale?: number;
    enterScale?: number;
  }) {
    const center = this.getCanvasCenter();
    const target = options?.targetPos ?? center;
    const exitDuration = options?.exitDuration ?? 0.32;
    const appearDuration = options?.appearDuration ?? 0.4;
    const offsetRatio = options?.offsetRatio ?? 0.06;
    const appearOffset = Math.max(10, Math.round(this.renderer.h * offsetRatio));
      const disappearScale = options?.disappearScale ?? this.centerBaseScale * 0.55;
      const enterScale = options?.enterScale ?? this.centerMinScale;

    this.centerPos.x = center.x;
    this.centerPos.y = center.y;

    this.anim.play({
      duration: exitDuration,
      onUpdate: (p) => {
        const t = easeOutCubic(p);
        this.centerPos.x = lerp(center.x, target.x, t);
        this.centerPos.y = lerp(center.y, target.y, t);
          this.centerScale = lerp(this.centerBaseScale, disappearScale, t);
        this.centerOpacity = 1 - t;
      },
      onDone: () => {
        this.centerOpacity = 0;
        this.centerScale = disappearScale;

        this.applyCenterSymbol(next, { resetVisual: false });
        this.centerPos.x = center.x;
        this.centerPos.y = center.y + appearOffset;
        this.centerScale = enterScale;
        this.centerOpacity = 0;

        this.anim.play({
          duration: appearDuration,
          onUpdate: (p2) => {
            const t2 = easeOutCubic(p2);
            this.centerPos.x = center.x;
            this.centerPos.y = center.y + (1 - t2) * appearOffset;
              this.centerScale = lerp(enterScale, this.centerBaseScale, t2);
            this.centerOpacity = Math.min(1, t2 * 1.1);
          },
          onDone: () => {
            this.centerPos.x = center.x;
            this.centerPos.y = center.y;
              this.centerScale = this.centerBaseScale;
            this.centerOpacity = 1;
            this.recordPromptSpawn();
          }
        });
      }
    });
  }

  onKeyDown(e: KeyboardEvent) {
    if (this.isGameOver) return;
    if (this.anim.isActive()) return; // ignore input during animations

    console.log('[debug] Game.onKeyDown', e.key);

    // If no symbols are initialized yet, ignore input and warn
    if (!this.symbols || this.symbols.length === 0) {
      console.warn('[debug] onKeyDown - no symbols to target yet');
      return;
    }

    // Map arrow keys to directions
    let inputDir: Direction | null = null;
    switch (e.key) {
      case 'ArrowUp': inputDir = 'up'; break;
      case 'ArrowRight': inputDir = 'right'; break;
      case 'ArrowDown': inputDir = 'down'; break;
      case 'ArrowLeft': inputDir = 'left'; break;
    }

    if (inputDir !== null) {
      this.handleInput(inputDir);
    }
  }

  private handleInput(inputDir: Direction) {
    console.log('[debug] handleInput', { inputDir, symbolCount: this.symbols.length, mechanic: this.activeMechanic });

    const dirToIndex: Record<Direction, number> = {
      up: 0,
      left: 1,
      right: 2,
      down: 3
    };

    const effectiveDir = this.mapInputDirection(inputDir);
    const idx = dirToIndex[effectiveDir];
    const ringSymbol = this.symbols[idx];
    if (!ringSymbol) {
      console.warn('[debug] handleInput - no ring symbol for direction', effectiveDir);
      return;
    }

    const expectedType = this.getExpectedSymbolType();
    console.log('[debug] centerSymbol', this.centerSymbol, 'expectedType', expectedType, 'ringSymbol', ringSymbol.type, 'remap', this.remapMapping);

    if (ringSymbol.type === expectedType) {
      // Correct answer
      this.handleCorrectSelection(ringSymbol);
    } else {
      this.handleWrongSelection(ringSymbol);
    }

    // Update HUD (score will be drawn on the canvas in draw())
  }

  private handleCorrectSelection(ringSymbol: Symbol) {
    this.score += 100;
    const bonus = this.computeTimeBonus();
    if (bonus !== 0) {
      this.timer.add(bonus);
      this.showTimeDelta(bonus);
    }
    this.streak += 1;
    if (this.score > this.highscore) {
      this.highscore = this.score;
    }

    // Visual and sound feedback
    this.effects.flash('#2ea043', 0.2);
    this.effects.symbolPulse({ current: ringSymbol.scale });
    this.audio.play('correct');
    this.triggerScoreParticles(ringSymbol);

    this.correctAnswers += 1;
    this.updateMechanicsAfterCorrect();

    const next = this.getRandomSymbolType(this.centerSymbol);
    this.anim.clear();
    this.animateCenterSwap(next, {
      targetPos: { x: ringSymbol.x, y: ringSymbol.y },
      exitDuration: 0.24,
      appearDuration: 0.34,
      offsetRatio: 0.085
    });

    if (this.score % 500 === 0) {
      this.initSymbols();
    }
  }

  private handleWrongSelection(ringSymbol: Symbol) {
    this.timer.add(-this.config.timePenalty);
    this.showTimeDelta(-this.config.timePenalty);
    this.effects.flash('#ff4433', 0.2);
    this.audio.play('wrong');
    this.streak = 0;
    const next = this.getRandomSymbolType(this.centerSymbol, ringSymbol.type);
    this.anim.clear();
    this.animateCenterSwap(next, {
      exitDuration: 0.22,
      appearDuration: 0.34,
      offsetRatio: 0.06,
      disappearScale: this.centerBaseScale * 0.5
    });
  }

  private triggerScoreParticles(ringSymbol: Symbol) {
    if (!this.particlesEnabled || this.particleDensity <= 0) return;

    const palette = SYMBOL_PALETTES[ringSymbol.type];
    const center = this.getCanvasCenter();
    const ringRadius = this.getRingRadius();
    const intensity = 1 + Math.min(this.streak, 20) * 0.08;
    const count = Math.max(0, Math.round(this.particleDensity * intensity));
    if (count <= 0) return;

    const brighten = Math.min(0.45, (this.streak - 1) * 0.025);
    const color = colorWithAlpha(palette.glow, 0.85, brighten);
    this.particles.spawnBurst({
      center,
      origin: { x: ringSymbol.x, y: ringSymbol.y },
      ringRadius,
      color,
      count,
      intensity
    });
  }

  private initSymbols() {
    const positions = this.computeRingPositions(0);
    const baseTypes = RING_SYMBOL_TYPES.slice(0, positions.length);
    this.symbols = positions.map((pos, index) => ({
      type: baseTypes[index % baseTypes.length],
      x: pos.x,
      y: pos.y,
      scale: this.ringSymbolScale,
      rotation: 0
    }));

    this.ringRotationOffset = 0;
    this.spinState = null;
    this.reapplyActiveMechanicLayout();
    this.applyCenterSymbol(this.getRandomSymbolType());
    this.centerScale = this.centerBaseScale;
    this.centerOpacity = 1;
    this.recordPromptSpawn();
    console.log('[debug] initSymbols created', this.symbols.length, 'symbols, currentTargetIndex=', this.currentTargetIndex, 'types=', this.symbols.map(s => s.type));
  }

  start() {
    if (this.configStore) {
      this.refreshSettings();
    }
    this.isGameOver = false;
    this.score = 0;
    this.streak = 0;
    this.timeDeltaValue = 0;
    this.timeDeltaTimer = 0;
    this.correctAnswers = 0;
    this.currentMechanicBlock = 0;
    this.activeMechanic = 'none';
    this.mechanicBannerText = null;
    this.remapMapping = null;
    this.memoryRevealTimer = 0;
    this.memorySymbolsHidden = false;
    this.joystickInverted = false;
    this.ringRotationOffset = 0;
    this.spinState = null;
    this.lastRandomMechanic = 'none';
    (Object.keys(this.mechanicRingAngles) as MechanicType[]).forEach((key) => {
      this.mechanicRingAngles[key] = 0;
    });
    this.syncHighscore();
    this.timer.set(this.config.duration);
    this.initSymbols();
    this.particles.clear();
    this.particles.setDespawnEnabled(!this.particlesPersist);
    console.log('[debug] Game.start() called');
    this.time.resumeLayer();
    this.clock.start((dt) => this.update(dt));
  }

  private update(dt: number) {
    if (this.isGameOver) return;

    // Update global time and timer
    this.time.tick(dt);
    this.timer.tick(dt);
    this.effects.update(dt);
    if (this.particlesEnabled) {
      this.particles.update(dt);
    }
    if (this.timeDeltaTimer > 0) {
      this.timeDeltaTimer = Math.max(0, this.timeDeltaTimer - dt);
      if (this.timeDeltaTimer <= 0.0001) {
        this.timeDeltaValue = 0;
        this.timeDeltaTimer = 0;
      }
    }

    if (this.activeMechanic === 'memory' && !this.memorySymbolsHidden) {
      if (this.memoryRevealTimer > 0) {
        this.memoryRevealTimer = Math.max(0, this.memoryRevealTimer - dt);
        if (this.memoryRevealTimer <= 0) {
          this.memorySymbolsHidden = true;
          this.ensureMemoryMessage();
        }
      } else {
        this.memorySymbolsHidden = true;
        this.ensureMemoryMessage();
      }
    }

    this.updateMechanicRings(dt);
    this.updateSpinAnimation(dt);

    // get current remaining time as float (used for game over check)
    const timeLeftFloat = this.timer.get();

    // Check for game over
    if (timeLeftFloat <= 0) {
      this.isGameOver = true;
      this.input.removeHandler(this);
      this.audio.play('gameover');
      this.recordScore();
      alert(`Game Over! Final score: ${this.score}`);
      return;
    }

    // Update animations
    this.anim.tick(dt);

    // Draw frame
    this.draw();
  }

  private draw() {
    const r = this.renderer;
    r.clear('#0d1117');
    this.drawRingBackdrop(r.ctx);
    this.drawMechanicRings(r.ctx);

    const hideRing = this.activeMechanic === 'memory' && this.memorySymbolsHidden;
    const spinState = this.spinState && this.spinState.active ? this.spinState : null;
    const velocity = spinState ? Math.abs(spinState.velocity) : 0;
    const blurAmount = spinState ? clamp(velocity * 0.1, 0, 5.5) : 0;
    const applyBlur = !hideRing && blurAmount > 0.15;

    // Draw symbols
    if (applyBlur) {
      r.ctx.save();
      r.ctx.filter = `blur(${blurAmount.toFixed(2)}px)`;
    }
      this.symbols.forEach((symbol) => {
        if (hideRing) {
          return;
        }
        // ring answers are not the current prompt; draw with normal glow
        drawSymbol(r.ctx, symbol, false, this.symbolStrokeScale);
      });
    if (applyBlur) {
      r.ctx.restore();
    }

    if (this.particlesEnabled) {
      this.particles.draw(r.ctx);
    }

    // Draw center prompt symbol larger in the middle (may be animating)
    const centerX = this.centerPos.x || r.w / 2;
    const centerY = this.centerPos.y || r.h / 2;
    const centerSym: Symbol = { type: this.centerSymbol, x: centerX, y: centerY, scale: this.centerScale, rotation: 0 };
    r.ctx.save();
    r.ctx.globalAlpha = this.centerOpacity;
    drawSymbol(r.ctx, centerSym, true, this.symbolStrokeScale);
    r.ctx.restore();

    // Draw HUD (streak, score, highscore)
    r.ctx.save();
    const scoreFontSize = Math.max(24, Math.round(r.h * 0.08));
    const hudPad = Math.round(Math.max(8, r.h * 0.02));
    const topY = Math.round(hudPad);
    const hudCenterX = Math.round(r.w / 2);
    r.ctx.textBaseline = 'top';
    r.ctx.shadowColor = 'rgba(0,0,0,0.6)';

    // Score prominent in the center
    r.ctx.font = `${scoreFontSize}px Orbitron, sans-serif`;
    r.ctx.fillStyle = '#ffffff';
    r.ctx.textAlign = 'center';
    r.ctx.shadowBlur = 6;
    r.ctx.fillText(`${this.score}`, hudCenterX, topY);

    // Side HUD entries
    const labelFontSize = Math.max(10, Math.round(scoreFontSize * 0.26));
    const valueFontSize = Math.max(14, Math.round(scoreFontSize * 0.44));
    const labelOffset = Math.max(2, Math.round(r.h * 0.004));
    r.ctx.shadowBlur = 3;

    // Streak (left)
    r.ctx.textAlign = 'left';
    r.ctx.font = `${labelFontSize}px Orbitron, sans-serif`;
    r.ctx.fillStyle = 'rgba(126, 231, 135, 0.7)';
    r.ctx.fillText('Streak', hudPad, topY);
    r.ctx.font = `${valueFontSize}px Orbitron, sans-serif`;
    r.ctx.fillStyle = '#7ee787';
    r.ctx.fillText(`${this.streak}`, hudPad, topY + labelFontSize + labelOffset);

    // Highscore (right)
    r.ctx.textAlign = 'right';
    r.ctx.font = `${labelFontSize}px Orbitron, sans-serif`;
    r.ctx.fillStyle = 'rgba(121, 192, 255, 0.7)';
    r.ctx.fillText('Best', r.w - hudPad, topY);
    r.ctx.font = `${valueFontSize}px Orbitron, sans-serif`;
    r.ctx.fillStyle = '#79c0ff';
    r.ctx.fillText(`${this.highscore}`, r.w - hudPad, topY + labelFontSize + labelOffset);
    r.ctx.restore();

    const showRemapMapping = this.activeMechanic === 'remap' && this.remapMapping;
    const bannerText = !showRemapMapping && this.mechanicBannerText ? this.mechanicBannerText.trim() : '';
    if (showRemapMapping || bannerText) {
      const center = this.getCanvasCenter();
      const radius = this.getRingRadius();
      const scaleFactor = this.ringSymbolScale / BASE_RING_SYMBOL_SCALE;
      const rowScale = clamp(r.h * 0.0013, 0.52, 0.78) * scaleFactor;
      const symbolSize = 46 * rowScale;
      const spacing = Math.max(symbolSize * 0.32, 18);
      const arrowWidth = Math.max(symbolSize * 1.35, 54);
      const arrowThickness = Math.max(symbolSize * 0.26, 9);
      const arrowHead = arrowWidth * 0.24;
      const arrowHeadHeight = arrowThickness * 1.35;
      const totalWidth = symbolSize * 2 + arrowWidth + spacing * 2;
      const startX = (r.w - totalWidth) / 2;
      const scoreBlockHeight = Math.max(scoreFontSize, labelFontSize + labelOffset + valueFontSize);
      const scoreboardBottom = topY + scoreBlockHeight;
      const ringTop = center.y - radius;
      let mapY = scoreboardBottom + Math.max(16, (ringTop - scoreboardBottom) * 0.45);
      mapY = Math.min(mapY, ringTop - Math.max(symbolSize * 0.6, 28));
      mapY = Math.max(mapY, scoreboardBottom + symbolSize * 0.6);

      if (showRemapMapping && this.remapMapping) {
        let cursor = startX;
        const leftX = cursor + symbolSize / 2;
        cursor += symbolSize + spacing;
        const arrowX = cursor + arrowWidth / 2;
        cursor += arrowWidth + spacing;
        const rightX = cursor + symbolSize / 2;

        const leftSymbol: Symbol = { type: this.remapMapping.from, x: leftX, y: mapY, scale: rowScale, rotation: 0 };
        const rightSymbol: Symbol = { type: this.remapMapping.to, x: rightX, y: mapY, scale: rowScale, rotation: 0 };
        const bannerStroke = Math.max(0.4, this.symbolStrokeScale * 0.85);
        drawSymbol(r.ctx, leftSymbol, true, bannerStroke);
        drawSymbol(r.ctx, rightSymbol, true, bannerStroke);

        r.ctx.save();
        r.ctx.translate(arrowX, mapY);
        r.ctx.beginPath();
        const halfThickness = arrowThickness / 2;
        const bodyLength = arrowWidth - arrowHead;
        const bodyStart = -arrowWidth / 2;
        const bodyEnd = bodyStart + bodyLength;
        r.ctx.moveTo(bodyStart, -halfThickness);
        r.ctx.lineTo(bodyEnd, -halfThickness);
        r.ctx.lineTo(bodyEnd, -arrowHeadHeight);
        r.ctx.lineTo(arrowWidth / 2, 0);
        r.ctx.lineTo(bodyEnd, arrowHeadHeight);
        r.ctx.lineTo(bodyEnd, halfThickness);
        r.ctx.lineTo(bodyStart, halfThickness);
        r.ctx.closePath();
        const arrowColor = MECHANIC_COLORS.remap;
        r.ctx.fillStyle = arrowColor;
        r.ctx.globalAlpha = 0.92;
        r.ctx.shadowColor = arrowColor;
        r.ctx.shadowBlur = 14;
        r.ctx.fill();
        r.ctx.restore();
      } else if (bannerText) {
        r.ctx.save();
        r.ctx.font = `${Math.max(18, Math.round(r.h * 0.05))}px Orbitron, sans-serif`;
        r.ctx.textAlign = 'center';
        r.ctx.textBaseline = 'middle';
        const color = MECHANIC_COLORS[this.activeMechanic] ?? MECHANIC_COLORS.none;
        r.ctx.fillStyle = color;
        r.ctx.shadowColor = 'rgba(0, 0, 0, 0.55)';
        r.ctx.shadowBlur = 10;
        r.ctx.fillText(bannerText, r.w / 2, mapY);
        r.ctx.restore();
      }
    }

    // Draw time bar

    const pad = Math.round(Math.max(12, r.h * 0.03));
    const barH = Math.max(6, Math.round(r.h * 0.012));
    const barW = r.w - pad * 2;
    const timeRatio = Math.max(0, Math.min(1, this.timer.get() / this.config.duration));

    // timebar background
    r.ctx.fillStyle = '#1f2632';
    const barY = r.h - pad - barH;
    r.ctx.fillRect(pad, barY, barW, barH);

    // timebar fill
    r.ctx.fillStyle = timeRatio > 0.3 ? '#78c6ff' : '#ff4433';
    r.ctx.fillRect(pad, barY, Math.round(barW * timeRatio), barH);

    // draw time number above the timebar, including the last delta if active
    r.ctx.save();
    const fontSize = Math.max(12, Math.round(r.h * 0.04));
    r.ctx.font = `${fontSize}px Orbitron, sans-serif`;
    r.ctx.textBaseline = 'bottom';
    const timeDisplay = Math.max(0, this.timer.get()).toFixed(1);
    const deltaActive = this.timeDeltaTimer > 0 && this.timeDeltaValue !== 0;
    const displayY = barY - Math.max(4, Math.round(r.h * 0.01));
    if (!deltaActive) {
      r.ctx.fillStyle = '#ffffff';
      r.ctx.textAlign = 'center';
      r.ctx.fillText(timeDisplay, r.w / 2, displayY);
    } else {
      const delta = this.timeDeltaValue;
      const sign = delta > 0 ? '+' : '-';
      const magnitude = Math.abs(delta).toFixed(1).replace(/\.0$/, '');
      const deltaText = `${sign} ${magnitude}`;
      const spacing = Math.max(6, Math.round(r.h * 0.01));

      r.ctx.textAlign = 'left';
      const baseMetrics = r.ctx.measureText(timeDisplay);
      const deltaMetrics = r.ctx.measureText(deltaText);
      const totalWidth = baseMetrics.width + spacing + deltaMetrics.width;
      const startX = r.w / 2 - totalWidth / 2;

      r.ctx.fillStyle = '#ffffff';
      r.ctx.fillText(timeDisplay, startX, displayY);

      const fade = Math.max(0, Math.min(1, this.timeDeltaTimer / TIME_DELTA_DISPLAY_SEC));
      r.ctx.globalAlpha = fade;
      r.ctx.fillStyle = delta > 0 ? '#7ee787' : '#ff6f6f';
      r.ctx.fillText(deltaText, startX + baseMetrics.width + spacing, displayY);
      r.ctx.globalAlpha = 1;
    }
    r.ctx.restore();

  }

  // Public API methods
  addTime(seconds: number) { this.timer.add(seconds); }
  setTime(seconds: number) { this.timer.set(seconds); }
  pauseLayer() { this.time.pauseLayer(); }
  resumeLayer() { this.time.resumeLayer(); }
}
