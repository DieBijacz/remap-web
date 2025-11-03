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
const easeInCubic = (t: number) => t * t * t;
const SCORE_PULSE_DURATION = 0.5;
const SCORE_PULSE_SCALE = 0.12;
const SCORE_TRACER_DURATION = 0.55;
const SCORE_TRACER_TRAIL = 0.22;
const SCORE_TRACER_THICKNESS = 5;
const SCORE_TRACER_COUNT = 3;
type Direction = 'up' | 'right' | 'down' | 'left';
type MechanicType = 'none' | 'remap' | 'spin' | 'memory' | 'joystick';
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

type ScoreTracer = {
  start: { x: number; y: number };
  end: { x: number; y: number };
  age: number;
  duration: number;
  color: string;
  thickness: number;
  trailWindow: number;
  baseAlpha: number;
  glow: number;
};

interface HudMetrics {
  hudPad: number;
  topY: number;
  scoreFontSize: number;
  labelFontSize: number;
  valueFontSize: number;
  labelOffset: number;
  scoreBlockHeight: number;
  scoreStripBottom: number;
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
    ringRadiusFactor: 0.15,
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
    ringRadiusFactor: 0.15,
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
  private playfieldCenter = { x: 0, y: 0 };
  private lastRingCenter = { x: 0, y: 0 };
  private promptSpawnTime = 0;
  private isGameOver = false;
  private configStore: ConfigStore | null = null;
  private correctAnswers = 0;
  private currentMechanicBlock = 0;
  private mechanicInterval = MECHANIC_INTERVAL;
  private mechanicRandomize = false;
  private difficulty: 'easy' | 'medium' | 'hard' | 'progressive' = 'medium';
  private mechanicSlots = 1;
  private activeMechanics: MechanicType[] = [];
  private mechanicBannerText: string | null = null;
  private remapMapping: { from: SymbolType; to: SymbolType } | null = null;
  private memoryRevealTimer = 0;
  private memorySymbolsHidden = false;
  private memoryPreviewDuration = MEMORY_PREVIEW_DURATION;
  private joystickInverted = false;
  private ringRotationOffset = 0;
  private spinState: SpinState | null = null;
  private spinState: SpinState | null = null;
  private lastMechanicSet: MechanicType[] = [];
  private particlesEnabled = true;
  private particlesPersist = false;
  private scoreTracerEnabled = true;
  private scoreTracerCountSetting = SCORE_TRACER_COUNT;
  private scoreTracerThickness = 1;
  private scoreTracerIntensity = 1;
  private mechanicEnabled: Record<'remap' | 'spin' | 'memory' | 'joystick', boolean> = {
    remap: true,
    spin: true,
    memory: true,
    joystick: true
  };
  private scorePulseColor = '#79c0ff';
  private scorePulseTimer = 0;
  private scoreTracers: ScoreTracer[] = [];
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

  private getEnabledMechanicPool(): MechanicType[] {
    return ['remap', 'spin', 'memory', 'joystick'].filter((mechanic) => this.mechanicEnabled[mechanic as keyof typeof this.mechanicEnabled]);
  }

  private pickRandomMechanicSet(pool: MechanicType[], count: number): MechanicType[] {
    if (count <= 0 || pool.length === 0) return [];
    const shuffled = this.shuffleArray(pool);
    return shuffled.slice(0, count);
  }

  private pickSequentialMechanicSet(pool: MechanicType[], count: number, blockIndex: number): MechanicType[] {
    if (count <= 0 || pool.length === 0) return [];
    const offset = (blockIndex - 1) % pool.length;
    const rotated = pool.slice(offset).concat(pool.slice(0, offset));
    return rotated.slice(0, count);
  }

  private rollRandomMechanic(exclude?: MechanicType): MechanicType {
    const pool = this.getEnabledMechanicPool();
    if (pool.length === 0) {
      return 'none';
    }
    const filtered = exclude ? pool.filter((mechanic) => mechanic !== exclude) : pool;
    const candidates = filtered.length > 0 ? filtered : pool;
    return this.randomChoice<MechanicType>(candidates, candidates[0] ?? pool[0]);
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
    return [...this.activeMechanics];
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
    if (this.activeMechanics.includes('remap') && this.remapMapping) {
      if (this.centerSymbol === this.remapMapping.from) {
        return this.remapMapping.to;
      }
    }
    return this.centerSymbol;
  }

  private mapInputDirection(dir: Direction): Direction {
    if (!this.activeMechanics.includes('joystick')) {
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
    if (!this.activeMechanics.includes('memory')) {
      return;
    }
    this.updateMechanicBannerText();
  }

  private triggerMechanicFlash(type: MechanicType) {
    if (type === 'none') return;
    const color = MECHANIC_COLORS[type] ?? MECHANIC_COLORS.none;
    this.effects.flash(colorWithAlpha(color, 1), 0.24, 0.22);
  }

  private activateMechanic(type: MechanicType) {
    if (type === 'none' || this.activeMechanics.includes(type)) return;
    switch (type) {
      case 'remap':
        this.rollRemapMapping();
        break;
      case 'spin':
        this.applySpinShuffle();
        break;
      case 'memory':
        this.memorySymbolsHidden = false;
        this.memoryRevealTimer = this.memoryPreviewDuration;
        this.applySpinShuffle();
        break;
      case 'joystick':
        this.joystickInverted = true;
        break;
      default:
        break;
    }
    this.triggerMechanicFlash(type);
  }

  private deactivateMechanic(type: MechanicType) {
    switch (type) {
      case 'remap':
        this.remapMapping = null;
        break;
      case 'spin':
        this.cancelSpinAnimation(0);
        break;
      case 'memory':
        this.memorySymbolsHidden = false;
        this.memoryRevealTimer = 0;
        break;
      case 'joystick':
        this.joystickInverted = false;
        break;
      default:
        break;
    }
  }

  private updateMechanicBannerText() {
    const names = this.activeMechanics
      .map((type) => this.getMechanicDescriptor(type))
      .filter((value, index, array): value is string => !!value && array.indexOf(value) === index);
    this.mechanicBannerText = names.length > 0 ? names.join('  |  ') : null;
  }

  private getMechanicDescriptor(type: MechanicType): string | null {
    switch (type) {
      case 'remap':
        return this.remapMapping ? 'Remap' : 'Remap';
      case 'spin':
        return 'Spin Mode';
      case 'memory':
        return this.memorySymbolsHidden ? 'Memory Recall' : 'Memory Prep';
      case 'joystick':
        return 'Joystick Flip';
      default:
        return null;
    }
  }

  private setActiveMechanics(next: MechanicType[]) {
    const unique = Array.from(new Set(next.filter((type) => this.mechanicEnabled[type])));
    const removed = this.activeMechanics.filter((type) => !unique.includes(type));
    const added = unique.filter((type) => !this.activeMechanics.includes(type));

    removed.forEach((type) => this.deactivateMechanic(type));
    added.forEach((type) => this.activateMechanic(type));

    this.activeMechanics = unique;
    this.reapplyActiveMechanicLayout();
    this.updateMechanicBannerText();
  }

  private refreshMechanic(mechanic: MechanicType) {
    switch (mechanic) {
      case 'remap':
        this.rollRemapMapping();
        break;
      case 'spin':
        this.applySpinShuffle();
        break;
      case 'memory':
        this.ensureMemoryMessage();
        break;
      default:
        break;
    }
  }

  private refreshActiveMechanics() {
    this.activeMechanics.forEach((mechanic) => this.refreshMechanic(mechanic));
  }

  private updateMechanicsAfterCorrect() {
    if (this.mechanicInterval <= 0) {
      return;
    }
    const newBlock = Math.floor(this.correctAnswers / this.mechanicInterval);
    const enabledMechanics = this.getEnabledMechanicPool();
    if (this.difficulty === 'progressive') {
      this.applyProgressiveMechanics(newBlock, enabledMechanics);
      return;
    }
    const slots = Math.min(this.mechanicSlots, enabledMechanics.length);

    if (newBlock !== this.currentMechanicBlock) {
      this.currentMechanicBlock = newBlock;
      if (newBlock <= 0 || slots <= 0) {
        this.setActiveMechanics([]);
        this.lastMechanicSet = [];
        return;
      }

      const next = this.mechanicRandomize
        ? this.pickRandomMechanicSet(enabledMechanics, slots)
        : this.pickSequentialMechanicSet(enabledMechanics, slots, newBlock);

      this.setActiveMechanics(next);
      this.lastMechanicSet = next;
    } else {
      if (this.activeMechanics.length === 0 && slots > 0) {
        const next = this.pickRandomMechanicSet(enabledMechanics, slots);
        this.setActiveMechanics(next);
        this.lastMechanicSet = next;
      } else {
        this.refreshActiveMechanics();
      }
    }
  }

  // Applies the staged mechanic ramp for progressive difficulty.
  private applyProgressiveMechanics(block: number, enabledMechanics: MechanicType[]) {
    const targetCount = this.getProgressiveMechanicCount(block, enabledMechanics.length);

    if (block !== this.currentMechanicBlock) {
      this.currentMechanicBlock = block;
      if (targetCount <= 0) {
        this.setActiveMechanics([]);
        this.lastMechanicSet = [];
        return;
      }
      const next = this.pickRandomMechanicSet(enabledMechanics, targetCount);
      this.setActiveMechanics(next);
      this.lastMechanicSet = next;
      return;
    }

    if (targetCount <= 0) {
      if (this.activeMechanics.length > 0) {
        this.setActiveMechanics([]);
        this.lastMechanicSet = [];
      }
      return;
    }

    const cappedCount = Math.min(targetCount, enabledMechanics.length);
    const currentCount = this.activeMechanics.length;
    const needsRefresh =
      currentCount !== cappedCount ||
      !this.activeMechanics.every((mechanic) => enabledMechanics.includes(mechanic));

    if (needsRefresh) {
      const next = this.pickRandomMechanicSet(enabledMechanics, cappedCount);
      this.setActiveMechanics(next);
      this.lastMechanicSet = next;
    } else {
      this.refreshActiveMechanics();
    }
  }

  // Progressive difficulty unlocks mechanics in expanding blocks of correct answers.
  private getProgressiveMechanicCount(block: number, available: number) {
    if (available <= 0) {
      return 0;
    }
    if (block <= 0) {
      return 0;
    }
    if (block <= 4) {
      return Math.min(1, available);
    }
    if (block <= 8) {
      return Math.min(2, available);
    }
    return Math.min(4, available);
  }

  private reapplyActiveMechanicLayout() {
    this.applyDefaultRingOrder();
    if (this.activeMechanics.includes('spin') || this.activeMechanics.includes('memory')) {
      this.applySpinShuffle();
    }
    if (!this.activeMechanics.includes('memory')) {
      this.memorySymbolsHidden = false;
      this.memoryRevealTimer = 0;
    } else {
      this.ensureMemoryMessage();
    }
    if (!this.activeMechanics.includes('joystick')) {
      this.joystickInverted = false;
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
    const { w, h } = this.renderer;
    const radius = this.getRingRadius();
    const targetY = Math.round(h * 0.62);
    const topMargin = Math.max(radius + 100, h * 0.22);
    const bottomMargin = Math.max(radius + 90, h * 0.24);
    const centerY = clamp(targetY, topMargin, h - bottomMargin);
    this.playfieldCenter = { x: w / 2, y: centerY };
    return this.playfieldCenter;
  }

  private getScoreAnchor() {
    const scoreFontSize = Math.max(24, Math.round(this.renderer.h * 0.08));
    const hudPad = Math.round(Math.max(8, this.renderer.h * 0.02));
    return {
      x: Math.round(this.renderer.w / 2),
      y: Math.round(hudPad) + scoreFontSize / 2,
      fontSize: scoreFontSize
    };
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

    const difficultySetting = typeof data.difficulty === 'string' ? data.difficulty : this.difficulty;
    const previousDifficulty = this.difficulty;
    if (
      difficultySetting === 'easy' ||
      difficultySetting === 'medium' ||
      difficultySetting === 'hard' ||
      difficultySetting === 'progressive'
    ) {
      this.difficulty = difficultySetting;
    } else {
      this.difficulty = 'medium';
    }
    const difficultyChanged = this.difficulty !== previousDifficulty;
    this.mechanicSlots =
      this.difficulty === 'easy'
        ? 1
        : this.difficulty === 'hard'
          ? 3
          : this.difficulty === 'progressive'
            ? 1
            : 2;

    const rawInterval = typeof data.mechanicInterval === 'number' ? data.mechanicInterval : this.mechanicInterval;
    const clampedInterval = Math.max(1, Math.round(clamp(rawInterval, 1, 60)));
    const randomize = this.difficulty === 'progressive'
      ? true
      : Boolean(data.mechanicRandomize ?? false);
    const intervalChanged = clampedInterval !== this.mechanicInterval;
    const randomChanged = randomize !== this.mechanicRandomize;

    this.mechanicInterval = clampedInterval;
    this.mechanicRandomize = randomize;

    if (intervalChanged || randomChanged || difficultyChanged) {
      if (!this.mechanicRandomize || difficultyChanged) {
        this.lastMechanicSet = [];
      }
      this.updateMechanicsAfterCorrect();
    }

    const memoryPreviewSetting =
      typeof data.memoryPreviewDuration === 'number' ? data.memoryPreviewDuration : this.memoryPreviewDuration;
    this.memoryPreviewDuration = clamp(memoryPreviewSetting, 0.2, 6);

    const particleSetting = typeof data.particlesPerScore === 'number' ? data.particlesPerScore : this.particleDensity;
    this.particleDensity = clamp(particleSetting, 0, 20);
    const particlesEnabledSetting = data.particlesEnabled;
    const particlesActive = particlesEnabledSetting !== false && this.particleDensity > 0;
    this.particlesEnabled = particlesActive;
    const particlesPersistSetting = data.particlesPersist;
    this.particlesPersist = Boolean(particlesPersistSetting);
    this.particles.setDespawnEnabled(!this.particlesPersist);
    if (!this.particlesEnabled) {
      this.particles.clear();
    }

    const tracerCountSetting = typeof data.scoreRayCount === 'number' ? data.scoreRayCount : this.scoreTracerCountSetting;
    this.scoreTracerCountSetting = clamp(tracerCountSetting, 0, 12);
    const tracerEnabledSetting = data.scoreRayEnabled;
    const scoreTracerActive = tracerEnabledSetting !== false && this.scoreTracerCountSetting > 0;
    this.scoreTracerEnabled = scoreTracerActive;
    const tracerThicknessSetting = typeof data.scoreRayThickness === 'number' ? data.scoreRayThickness : this.scoreTracerThickness;
    this.scoreTracerThickness = clamp(tracerThicknessSetting, 0.2, 3);
    const tracerIntensitySetting = typeof data.scoreRayIntensity === 'number' ? data.scoreRayIntensity : this.scoreTracerIntensity;
    this.scoreTracerIntensity = clamp(tracerIntensitySetting, 0.3, 2.5);
    if (!this.scoreTracerEnabled) {
      this.scoreTracers = [];
    }

    const nextMechanicEnabled: typeof this.mechanicEnabled = {
      remap: data.mechanicEnableRemap !== false,
      spin: data.mechanicEnableSpin !== false,
      memory: data.mechanicEnableMemory !== false,
      joystick: data.mechanicEnableJoystick !== false
    };
    const mechanicsChanged = (Object.keys(nextMechanicEnabled) as Array<keyof typeof nextMechanicEnabled>).some(
      (key) => this.mechanicEnabled[key] !== nextMechanicEnabled[key]
    );
    this.mechanicEnabled = nextMechanicEnabled;
    if (mechanicsChanged) {
      const filtered = this.activeMechanics.filter((type) => this.mechanicEnabled[type]);
      if (filtered.length !== this.activeMechanics.length) {
        this.setActiveMechanics(filtered);
      }
      this.updateMechanicsAfterCorrect();
    }
  }

  private getRingRadius() {
    return Math.round(this.renderer.w * this.config.ringRadiusFactor);
  }

  private computeRingPositions(offset = this.ringRotationOffset, anchor?: { x: number; y: number }) {
    const radius = this.getRingRadius();
    const target = anchor ?? ((this.playfieldCenter.x !== 0 || this.playfieldCenter.y !== 0)
      ? this.playfieldCenter
      : this.getCanvasCenter());
    return RING_BASE_ANGLES.map((base) => {
      const angle = base + offset;
      return {
        x: target.x + radius * Math.cos(angle),
        y: target.y + radius * Math.sin(angle)
      };
    });
  }

  private updateRingLayout() {
    if (!this.symbols.length) return;
    const anchor = (this.playfieldCenter.x !== 0 || this.playfieldCenter.y !== 0)
      ? this.playfieldCenter
      : this.getCanvasCenter();
    const positions = this.computeRingPositions(this.ringRotationOffset, anchor);
    positions.forEach((pos, index) => {
      const symbol = this.symbols[index];
      if (symbol) {
        symbol.x = pos.x;
        symbol.y = pos.y;
        symbol.scale = this.ringSymbolScale;
        symbol.rotation = this.ringRotationOffset;
      }
    });
    this.lastRingCenter = { x: anchor.x, y: anchor.y };
    if (!this.anim.isActive()) {
      this.centerPos.x = anchor.x;
      this.centerPos.y = anchor.y;
    }
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
    const center = this.playfieldCenter.x || this.playfieldCenter.y
      ? this.playfieldCenter
      : this.getCanvasCenter();
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
    console.log('[debug] handleInput', { inputDir, symbolCount: this.symbols.length, mechanics: this.activeMechanics });

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
    this.effects.symbolPulse({ current: ringSymbol.scale });
    this.audio.play('correct');
    this.triggerScoreCelebration(ringSymbol);
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

  private triggerScoreCelebration(ringSymbol: Symbol) {
    this.scorePulseTimer = SCORE_PULSE_DURATION;
    const target = this.getScoreAnchor();
    const palette = SYMBOL_PALETTES[ringSymbol.type];
    this.scorePulseColor = palette.glow;

    if (!this.scoreTracerEnabled) {
      return;
    }

    const tracerCountSetting = Math.max(0, Math.round(this.scoreTracerCountSetting));
    if (tracerCountSetting <= 0) {
      return;
    }

    const intensity = clamp(this.scoreTracerIntensity, 0.3, 2.5);
    const thicknessBase = SCORE_TRACER_THICKNESS * this.scoreTracerThickness;
    const speedFactor = 0.6 + intensity * 0.4;
    const durationBase = SCORE_TRACER_DURATION / speedFactor;
    const baseTrail = clamp(SCORE_TRACER_TRAIL / speedFactor, 0.05, 0.65);
    const baseAlpha = clamp(0.55 + (intensity - 1) * 0.25, 0.35, 0.95);
    const baseGlow = 12 * (0.6 + intensity * 0.7);
    const tracerColor = colorWithAlpha(palette.glow, 0.82, 0.3);
    const start = { x: ringSymbol.x, y: ringSymbol.y };

    for (let i = 0; i < tracerCountSetting; i += 1) {
      const jitter = (Math.random() - 0.5) * 0.12;
      const offsetX = (Math.random() - 0.5) * 26;
      const offsetY = (Math.random() - 0.5) * 18;
      const duration = durationBase * (0.85 + Math.random() * 0.3);
      const trailWindow = clamp(baseTrail * (0.85 + Math.random() * 0.3), 0.04, 0.75);
      const thickness = thicknessBase * (0.85 + Math.random() * 0.3);
      const alpha = clamp(baseAlpha * (0.9 + Math.random() * 0.2), 0.3, 1);
      const glow = baseGlow * (0.8 + Math.random() * 0.3);

      this.scoreTracers.push({
        start: { x: start.x + offsetX, y: start.y + offsetY },
        end: { x: target.x + offsetX * 0.15, y: target.y + offsetY * 0.1 },
        age: jitter > 0 ? jitter * 0.15 : 0,
        duration,
        color: tracerColor,
        thickness,
        trailWindow,
        baseAlpha: alpha,
        glow
      });
    }
    const maxTracers = Math.max(1, tracerCountSetting) * 12;
    if (this.scoreTracers.length > maxTracers) {
      this.scoreTracers.splice(0, this.scoreTracers.length - maxTracers);
    }
  }

  private updateScoreTracers(dt: number) {
    if (!this.scoreTracerEnabled) {
      this.scoreTracers = [];
      return;
    }
    for (let i = this.scoreTracers.length - 1; i >= 0; i -= 1) {
      const tracer = this.scoreTracers[i];
      tracer.age += dt;
      if (tracer.age >= tracer.duration) {
        this.scoreTracers.splice(i, 1);
      }
    }
  }

  private drawScoreTracers(ctx: CanvasRenderingContext2D) {
    if (!this.scoreTracerEnabled || this.scoreTracers.length === 0) return;

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    this.scoreTracers.forEach((tracer) => {
      const progress = Math.min(1, Math.max(0, tracer.age / tracer.duration));
      const headT = easeOutCubic(progress);
      const trailWindow = clamp(tracer.trailWindow, 0, 0.95);
      const tailProgress = Math.max(0, progress - trailWindow);
      const denominator = Math.max(0.0001, 1 - trailWindow);
      const tailNormalized = trailWindow >= 1 ? progress : Math.min(1, tailProgress / denominator);
      const tailT = easeOutCubic(tailNormalized);

      const dx = tracer.end.x - tracer.start.x;
      const dy = tracer.end.y - tracer.start.y;
      const headX = tracer.start.x + dx * headT;
      const headY = tracer.start.y + dy * headT;
      const tailX = tracer.start.x + dx * tailT;
      const tailY = tracer.start.y + dy * tailT;

      const width = tracer.thickness * (0.6 + 0.4 * (1 - progress));
      ctx.shadowColor = tracer.color;
      ctx.shadowBlur = tracer.glow;
      ctx.strokeStyle = tracer.color;
      ctx.lineWidth = width;
      ctx.globalAlpha = Math.max(0, Math.min(1, tracer.baseAlpha * (1 - progress * 0.75)));
      ctx.beginPath();
      ctx.moveTo(tailX, tailY);
      ctx.lineTo(headX, headY);
      ctx.stroke();

      ctx.shadowBlur = 0;
      ctx.globalAlpha = Math.max(0, Math.min(1, (tracer.baseAlpha + 0.1) * (1 - progress * 0.6)));
      ctx.fillStyle = tracer.color;
      ctx.beginPath();
      ctx.arc(headX, headY, width * 0.45, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 1;
    });
    ctx.restore();
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
    this.activeMechanics = [];
    this.lastMechanicSet = [];
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
    this.scorePulseTimer = 0;
    this.scorePulseColor = '#79c0ff';
    this.scoreTracers = [];
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
    if (this.scorePulseTimer > 0) {
      this.scorePulseTimer = Math.max(0, this.scorePulseTimer - dt);
    }
    this.updateScoreTracers(dt);
    if (this.timeDeltaTimer > 0) {
      this.timeDeltaTimer = Math.max(0, this.timeDeltaTimer - dt);
      if (this.timeDeltaTimer <= 0.0001) {
        this.timeDeltaValue = 0;
        this.timeDeltaTimer = 0;
      }
    }

    if (this.activeMechanics.includes('memory') && !this.memorySymbolsHidden) {
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
    const anchor = this.getCanvasCenter();
    if (anchor.x !== this.lastRingCenter.x || anchor.y !== this.lastRingCenter.y) {
      this.updateRingLayout();
    }
    if (!this.anim.isActive()) {
      this.centerPos.x = anchor.x;
      this.centerPos.y = anchor.y;
    }
    this.drawRingBackdrop(r.ctx);
    this.drawMechanicRings(r.ctx);

    const hideRing = this.activeMechanics.includes('memory') && this.memorySymbolsHidden;
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

    const hudMetrics = this.drawScoreboard(r.ctx);
    this.drawMechanicBanner(r.ctx, hudMetrics);
    this.drawTimeBar(r.ctx);

    this.lastRingCenter = anchor;
  }

  private drawScoreboard(ctx: CanvasRenderingContext2D): HudMetrics {
    const r = this.renderer;
    ctx.save();

    const hudPad = Math.round(Math.max(8, r.h * 0.02));
    const scoreFontSize = Math.max(24, Math.round(r.h * 0.07));
    const stripTop = Math.max(0, Math.round(hudPad * 0.12));
    const stripPadding = Math.round(hudPad * 0.5);
    const labelFontSize = Math.max(10, Math.round(scoreFontSize * 0.26));
    const valueFontSize = Math.max(14, Math.round(scoreFontSize * 0.44));
    const labelOffset = Math.max(2, Math.round(r.h * 0.004));
    const scoreBlockHeight = Math.max(scoreFontSize, labelFontSize + labelOffset + valueFontSize);
    const topY = stripTop + stripPadding;
    const hudCenterX = Math.round(r.w / 2);
    const scoreCenterY = topY + scoreFontSize / 2;
    const scorePulseRatio = Math.min(1, Math.max(0, this.scorePulseTimer / SCORE_PULSE_DURATION));
    const scorePulse = scorePulseRatio > 0 ? easeInCubic(scorePulseRatio) : 0;
    const scoreScale = 1 + SCORE_PULSE_SCALE * scorePulse;
    const scoreGlow = 0;
    const scoreGlowColor = 'rgba(0, 0, 0, 0)';

    const scoreStripBottom = topY + scoreBlockHeight + stripPadding;
    const stripHeight = scoreStripBottom - stripTop;
    ctx.fillStyle = 'rgba(8, 12, 20, 0.82)';
    ctx.fillRect(0, stripTop, r.w, stripHeight);
    const separatorHeight = Math.max(1, Math.round(r.h * 0.002));
    ctx.fillStyle = 'rgba(121, 192, 255, 0.28)';
    ctx.fillRect(hudPad, scoreStripBottom - Math.max(1, separatorHeight), r.w - hudPad * 2, separatorHeight);

    this.drawScoreTracers(ctx);
    ctx.save();
    ctx.textBaseline = 'top';
    ctx.textAlign = 'center';
    ctx.translate(hudCenterX, scoreCenterY);
    ctx.scale(scoreScale, scoreScale);
    ctx.translate(-hudCenterX, -scoreCenterY);
    ctx.font = `${scoreFontSize}px Orbitron, sans-serif`;
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = scoreGlowColor;
    ctx.shadowBlur = scoreGlow;
    ctx.fillText(`${this.score}`, hudCenterX, topY);
    ctx.restore();
    ctx.shadowBlur = 3;
    ctx.shadowColor = 'rgba(0,0,0,0.6)';

    ctx.textBaseline = 'top';

    ctx.textAlign = 'left';
    ctx.font = `${labelFontSize}px Orbitron, sans-serif`;
    ctx.fillStyle = 'rgba(126, 231, 135, 0.7)';
    ctx.fillText('Streak', hudPad, topY);
    ctx.font = `${valueFontSize}px Orbitron, sans-serif`;
    ctx.fillStyle = '#7ee787';
    ctx.fillText(`${this.streak}`, hudPad, topY + labelFontSize + labelOffset);

    ctx.textAlign = 'right';
    ctx.font = `${labelFontSize}px Orbitron, sans-serif`;
    ctx.fillStyle = 'rgba(121, 192, 255, 0.7)';
    ctx.fillText('Best', r.w - hudPad, topY);
    ctx.font = `${valueFontSize}px Orbitron, sans-serif`;
    ctx.fillStyle = '#79c0ff';
    ctx.fillText(`${this.highscore}`, r.w - hudPad, topY + labelFontSize + labelOffset);

    ctx.restore();

    return {
      hudPad,
      topY,
      scoreFontSize,
      labelFontSize,
      valueFontSize,
      labelOffset,
      scoreBlockHeight,
      scoreStripBottom
    };
  }

  private drawMechanicBanner(ctx: CanvasRenderingContext2D, metrics: HudMetrics) {
    const r = this.renderer;
    const showRemapMapping = this.activeMechanics.includes('remap') && this.remapMapping;
    const bannerText = this.mechanicBannerText ? this.mechanicBannerText.trim() : '';
    if (!showRemapMapping && !bannerText) {
      return;
    }

    const { scoreStripBottom } = metrics;
    const center = (this.playfieldCenter.x !== 0 || this.playfieldCenter.y !== 0)
      ? this.playfieldCenter
      : this.getCanvasCenter();
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
    const centerX = r.w / 2;
    const ringTop = center.y - radius;

    const textFontSize = Math.max(18, Math.round(r.h * 0.05));
    ctx.save();
    ctx.font = `${textFontSize}px Orbitron, sans-serif`;
    const textWidth = bannerText ? ctx.measureText(bannerText).width : 0;
    ctx.restore();

    const mappingHeight = showRemapMapping ? symbolSize : 0;
    const textHeight = bannerText ? textFontSize : 0;
    const textSpacing = showRemapMapping && bannerText ? Math.max(symbolSize * 0.25, 16) : 0;
    const contentWidth = Math.max(showRemapMapping ? totalWidth : 0, textWidth);
    const contentHeight = mappingHeight + textSpacing + textHeight;

    const boxPaddingX = Math.max(24, symbolSize * 0.4);
    const boxPaddingY = Math.max(16, symbolSize * 0.3);
    const boxWidth = contentWidth + boxPaddingX * 2;
    const boxHeight = contentHeight + boxPaddingY * 2;

    const desiredGap = Math.max(symbolSize * 0.55, 28);
    let boxBottom = ringTop - desiredGap;
    let boxTop = boxBottom - boxHeight;

    const minTop = scoreStripBottom + Math.max(18, symbolSize * 0.3);
    if (boxTop < minTop) {
      boxTop = minTop;
      boxBottom = boxTop + boxHeight;
    }

    const boxLeft = centerX - boxWidth / 2;
    const innerTop = boxTop + boxPaddingY;
    const cornerRadius = Math.min(boxHeight / 2, Math.max(16, symbolSize * 0.35));

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
    drawRoundedRect(boxLeft, boxTop, boxWidth, boxHeight, cornerRadius);
    ctx.fillStyle = 'rgba(12, 17, 27, 0.82)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(121, 192, 255, 0.28)';
    ctx.lineWidth = Math.max(1.2, symbolSize * 0.08);
    ctx.stroke();
    ctx.restore();

    if (showRemapMapping && this.remapMapping) {
      const mappingCenterY = innerTop + symbolSize / 2;
      let cursor = centerX - totalWidth / 2;
      const leftX = cursor + symbolSize / 2;
      cursor += symbolSize + spacing;
      const arrowX = cursor + arrowWidth / 2;
      cursor += arrowWidth + spacing;
      const rightX = cursor + symbolSize / 2;

      const leftSymbol: Symbol = { type: this.remapMapping.from, x: leftX, y: mappingCenterY, scale: rowScale, rotation: 0 };
      const rightSymbol: Symbol = { type: this.remapMapping.to, x: rightX, y: mappingCenterY, scale: rowScale, rotation: 0 };
      const bannerStroke = Math.max(0.4, this.symbolStrokeScale * 0.85);
      drawSymbol(ctx, leftSymbol, true, bannerStroke);
      drawSymbol(ctx, rightSymbol, true, bannerStroke);

      ctx.save();
      ctx.translate(arrowX, mappingCenterY);
      ctx.beginPath();
      const halfThickness = arrowThickness / 2;
      const bodyLength = arrowWidth - arrowHead;
      const bodyStart = -arrowWidth / 2;
      const bodyEnd = bodyStart + bodyLength;
      ctx.moveTo(bodyStart, -halfThickness);
      ctx.lineTo(bodyEnd, -halfThickness);
      ctx.lineTo(bodyEnd, -arrowHeadHeight);
      ctx.lineTo(arrowWidth / 2, 0);
      ctx.lineTo(bodyEnd, arrowHeadHeight);
      ctx.lineTo(bodyEnd, halfThickness);
      ctx.lineTo(bodyStart, halfThickness);
      ctx.closePath();
      const arrowColor = MECHANIC_COLORS.remap;
      ctx.fillStyle = arrowColor;
      ctx.globalAlpha = 0.92;
      ctx.shadowColor = arrowColor;
      ctx.shadowBlur = 14;
      ctx.fill();
      ctx.restore();
    }

    if (bannerText) {
      const textY = innerTop + mappingHeight + (mappingHeight > 0 ? textSpacing : 0) + textFontSize / 2;
      ctx.save();
      ctx.font = `${textFontSize}px Orbitron, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = colorWithAlpha('#cdd9e5', 0.95);
      ctx.shadowColor = 'rgba(0, 0, 0, 0.55)';
      ctx.shadowBlur = 8;
      ctx.fillText(bannerText, centerX, textY);
      ctx.restore();
    }
  }

  private drawTimeBar(ctx: CanvasRenderingContext2D) {
    const r = this.renderer;
    const pad = Math.round(Math.max(12, r.h * 0.03));
    const barH = Math.max(6, Math.round(r.h * 0.012));
    const barW = r.w - pad * 2;
    const timeRatio = Math.max(0, Math.min(1, this.timer.get() / this.config.duration));

    ctx.fillStyle = '#1f2632';
    const barY = r.h - pad - barH;
    ctx.fillRect(pad, barY, barW, barH);

    ctx.fillStyle = timeRatio > 0.3 ? '#78c6ff' : '#ff4433';
    ctx.fillRect(pad, barY, Math.round(barW * timeRatio), barH);

    ctx.save();
    const fontSize = Math.max(12, Math.round(r.h * 0.04));
    ctx.font = `${fontSize}px Orbitron, sans-serif`;
    ctx.textBaseline = 'middle';
    const timeDisplay = Math.max(0, this.timer.get()).toFixed(1);
    const deltaActive = this.timeDeltaTimer > 0 && this.timeDeltaValue !== 0;
    let deltaText = '';
    if (deltaActive) {
      const delta = this.timeDeltaValue;
      const sign = delta > 0 ? '+' : '-';
      const magnitude = Math.abs(delta).toFixed(1).replace(/\.0$/, '');
      deltaText = `${sign} ${magnitude}`;
    }

    const centerX = r.w / 2;
    const textY = barY + barH / 2;
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.45)';
    ctx.lineWidth = Math.max(1, Math.round(fontSize * 0.12));
    ctx.textAlign = 'center';
    ctx.strokeText(timeDisplay, centerX, textY);
    ctx.fillText(timeDisplay, centerX, textY);

    if (deltaActive && deltaText) {
      const fade = Math.max(0, Math.min(1, this.timeDeltaTimer / TIME_DELTA_DISPLAY_SEC));
      const offsetY = Math.max(barH + fontSize * 0.25, Math.round(fontSize * 0.9));
      ctx.save();
      ctx.globalAlpha = fade;
      ctx.fillStyle = this.timeDeltaValue > 0 ? '#7ee787' : '#ff6f6f';
      ctx.strokeText(deltaText, centerX, textY - offsetY);
      ctx.fillText(deltaText, centerX, textY - offsetY);
      ctx.restore();
    }
    ctx.restore();
  }

  // Public API methods
  addTime(seconds: number) { this.timer.add(seconds); }
  setTime(seconds: number) { this.timer.set(seconds); }
  pauseLayer() { this.time.pauseLayer(); }
  resumeLayer() { this.time.resumeLayer(); }
}
