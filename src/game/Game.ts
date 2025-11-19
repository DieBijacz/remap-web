import { Clock, PausableTime } from '../core/Clock';
import { Renderer2D } from '../render/Renderer2D';
import { AnimationTimeline, easeOutCubic } from '../core/Animation';
import { Timer } from '../core/Timer';
import { drawSymbol, getSymbolPalette, SYMBOL_THEME_SETS } from '../render/Symbols';
import type { Symbol, SymbolType, SymbolTheme } from '../render/Symbols';
import type { InputHandler } from '../input/InputManager';
import type { Action } from '../input/Keymap';
import { InputManager } from '../input/InputManager';
import { EffectsManager } from '../fx/EffectsManager';
import { ParticleSystem, type ParticleAbsorbEvent } from '../fx/ParticleSystem';
import { AudioSystem } from '../audio/AudioSystem';
import correctSfxUrl from '../audio/sfx/sfx_point.wav';
import wrongSfxUrl from '../audio/sfx/sfx_wrong.wav';
import dataVaultBackdropUrl from '../assets/data-vault-base.svg';
import HighscoreStore, { type HighscoreEntry } from '../storage/HighscoreStore';
import ConfigStore from '../storage/ConfigStore';
import type { Config as PersistentConfig } from '../storage/ConfigStore';
import {
  DEFAULT_SYMBOL_COLORS,
  cloneColor,
  rgbToCss,
  rgbToHex,
  sanitizeSymbolColors,
  type RGBColor
} from '../config/colorPresets';

const BASE_RING_SYMBOL_SCALE = 1.22;
const BASE_CENTER_SCALE = 1.85;
const CENTER_MIN_RATIO = 0.4;
const TIME_DELTA_DISPLAY_SEC = 1.1;
const TIMEBAR_TARGET_RATIO = 0.25;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const randBetween = (min: number, max: number) => Math.random() * (max - min) + min;
const TAU = Math.PI * 2;
const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeInOutCubicDerivative = (t: number) => (t < 0.5 ? 12 * t * t : 12 * Math.pow(1 - t, 2));
const easeInCubic = (t: number) => t * t * t;
const easeOutCubicTransition = (t: number) => 1 - Math.pow(1 - t, 3);
const SCORE_PULSE_DURATION = 0.5;
const SCORE_PULSE_SCALE = 0.12;
const SCORE_TRACER_DURATION = 0.55;
const SCORE_TRACER_TRAIL = 0.22;
const SCORE_TRACER_THICKNESS = 5;
const SCORE_TRACER_COUNT = 3;
const PROGRESSIVE_LEVEL_NOTICE_DURATION = 2.8;
const MENU_MIN_SYMBOLS = 4;
const MENU_MAX_SYMBOLS = 60;
const MENU_SYMBOL_BASE_SIZE = 46;
const INTRO_SYMBOL_BASE_DELAY = 0.08;
const INTRO_SYMBOL_DELAY_STEP = 0.09;
const INTRO_SYMBOL_BASE_DURATION = 0.65;
const INTRO_CENTER_DELAY_EXTRA = 0.2;
const INTRO_CENTER_DURATION = 0.7;
const INTRO_HUD_DELAY_OFFSET = 0.18;
const INTRO_HUD_FADE_DURATION = 0.35;
const BONUS_ACTIVE_DURATION = 6;
const BONUS_COOLDOWN_DURATION = 1.2;
const BONUS_SCORE_MULTIPLIER = 2;
const BONUS_ROTATION_BASE = 0.25;
const BONUS_ROTATION_EXTRA = 2.6;
type Direction = 'up' | 'right' | 'down' | 'left';
type MechanicType =
  | 'none'
  | 'remap'
  | 'memory'
  | 'joystick'
  | 'match-color'
  | 'match-shape';
type MatchMechanicMode = 'match-color' | 'match-shape';
type NameEntryMode = 'slots' | 'keyboard';
type BonusRingState = 'idle' | 'charging' | 'ready' | 'active' | 'cooldown';
export type GameCompletionSummary = {
  leaderboard: HighscoreEntry[];
  finalScore: number;
  placement: number | null;
  didQualify: boolean;
  playerName: string | null;
};
const MECHANIC_INTERVAL = 10;
const MEMORY_PREVIEW_DURATION = 1.0;
const RING_BASE_ANGLES = [-Math.PI / 2, Math.PI, 0, Math.PI / 2];
const MECHANIC_COLORS: Record<MechanicType, string> = {
  none: '#9da7b3',
  remap: '#ec4899',
  memory: '#f87171',
  joystick: '#34d399',
  'match-color': '#f472b6',
  'match-shape': '#22d3ee'
};
const isToggleMechanic = (type: MechanicType): type is Exclude<MechanicType, 'none'> => type !== 'none';
const NAME_SLOT_COUNT = 10;
const NAME_ALPHABET = [
  ' ',
  'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M',
  'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z',
  '0', '1', '2', '3', '4', '5', '6', '7', '8', '9',
  '-'
];
const NAME_KEYBOARD_ROWS: string[][] = [
  ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
  ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
  ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'],
  ['Z', 'X', 'C', 'V', 'B', 'N', 'M', 'BACK'],
  ['SPACE', 'OK']
];
const NAME_KEYBOARD_SPECIAL = {
  BACK: 'BACK',
  SPACE: 'SPACE',
  OK: 'OK'
} as const;
const LEADERBOARD_MAX_ENTRIES = 10;

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

type TimeBonusMode = 'classic' | 'endurance' | 'hybrid';

interface HudMetrics {
  hudPad: number;
  topY: number;
  scoreFontSize: number;
  labelFontSize: number;
  valueFontSize: number;
  labelOffset: number;
  scoreBlockHeight: number;
  scoreStripBottom: number;
  stripLeft: number;
  stripRight: number;
  stripHeight: number;
  streakBadge: { x: number; y: number; width: number; height: number };
  bestBadge: { x: number; y: number; width: number; height: number };
  scoreArea: { x: number; width: number; centerX: number; centerY: number };
}

interface MechanicLevelUpNotice {
  tier: number;
  slots: number;
  headline: string;
  summary: string;
  detail?: string;
  cta?: string;
}

interface IntroKeyframe {
  x: number;
  y: number;
  scale: number;
  opacity: number;
  rotation: number;
}

interface IntroSymbolState {
  symbol: Symbol;
  delay: number;
  duration: number;
  start: IntroKeyframe;
  end: IntroKeyframe;
  current: IntroKeyframe;
  progress: number;
  rotationTarget: number;
  curveStrength: number;
}

interface IntroCenterState {
  delay: number;
  duration: number;
  start: IntroKeyframe;
  end: IntroKeyframe;
  current: IntroKeyframe;
  progress: number;
  rotationTarget: number;
  curveStrength: number;
}

interface IntroTransitionState {
  timer: number;
  hudAlpha: number;
  hudDelay: number;
  hudFade: number;
  symbolStates: IntroSymbolState[];
  symbolLookup: Map<Symbol, IntroSymbolState>;
  center: IntroCenterState;
}

type AttractSymbolState = {
  symbol: Symbol;
  vx: number;
  vy: number;
  rotationSpeed: number;
  startScale: number;
  endScale: number;
  life: number;
  age: number;
  exitMargin: number;
  spawnDelay: number;
};

type AttractVisualConfig = {
  symbolTheme: SymbolTheme;
  count: number;
  baseSizeVW: number;
  sizeVariancePct: number;
  growthMultiplier: number;
  speedMultiplier: number;
};

type Rect = { x: number; y: number; width: number; height: number };

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

const colorsEqual = (a?: RGBColor | null, b?: RGBColor | null) =>
  !!a && !!b && a.r === b.r && a.g === b.g && a.b === b.b;

interface SpinState {
  active: boolean;
  elapsed: number;
  duration: number;
  swapAt: number;
  swapDone: boolean;
  targetTypes?: SymbolType[];
  startRotation: number;
  targetRotation: number;
  spins: number;
  velocity: number;
  onSwap?: (() => void) | null;
}

type RingAssignmentRole = 'correct' | 'bait' | 'filler';
type RingAssignment = {
  type: SymbolType;
  color: RGBColor;
  role: RingAssignmentRole;
};

interface RingLayoutPlan {
  centerType: SymbolType;
  centerColor: RGBColor;
  correctIndex: number;
  matchMode: MatchMechanicMode | null;
  applied: boolean;
  apply: () => void;
}

interface GameConfig {
  duration: number;        // Game duration in seconds
  timePenalty: number;     // Time lost on wrong answer
  symbolCount: number;     // Number of symbols to display
  maxTimeBonus: number;    // Maximum extra time rewarded
  minTimeBonus: number;    // Minimum extra time rewarded
  bonusWindow: number;     // Seconds window for full bonus
  timeBonusMode: TimeBonusMode;
  ringRadiusFactor: number;// Relative radius of outer ring
  symbolScale: number;
  symbolStroke: number;
  symbolTheme: SymbolTheme;
}

export class Game implements InputHandler {
  private clock = new Clock();
  private time = new PausableTime();
  private renderer: Renderer2D;
  private anim = new AnimationTimeline();
  private input: InputManager;
  private effects: EffectsManager;
  private particles = new ParticleSystem();
  private audio: AudioSystem;
  private vaultBackdropImage: HTMLImageElement | null = null;
  private vaultBackdropReady = false;
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
    timeBonusMode: 'classic',
    ringRadiusFactor: 0.15,
    symbolScale: 1,
    symbolStroke: 1,
    symbolTheme: 'classic',
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
    timeBonusMode: 'classic',
    ringRadiusFactor: 0.15,
    symbolScale: 1,
    symbolStroke: 1,
    symbolTheme: 'classic',
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
  private symbolTheme: SymbolTheme = 'classic';
  private symbolColorPool: RGBColor[] = DEFAULT_SYMBOL_COLORS.map(cloneColor);
  private centerSymbolColor: RGBColor = cloneColor(DEFAULT_SYMBOL_COLORS[0]);
  private centerOpacity = 1;
  private introTransition: IntroTransitionState | null = null;
  private attractSymbols: AttractSymbolState[] = [];
  private attractPulseTime = 0;
  private attractStartRect: Rect | null = null;
  private attractStartRequested = false;
  private attractPromptAlpha = 1;
  private attractVisualConfig: AttractVisualConfig = {
    symbolTheme: 'classic',
    count: 24,
    baseSizeVW: 6,
    sizeVariancePct: 30,
    growthMultiplier: 4.5,
    speedMultiplier: 1
  };
  private menuColorPool: RGBColor[] = DEFAULT_SYMBOL_COLORS.map(cloneColor);
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
  private progressiveMechanicLimit = 0;
  private mechanicLevelUpNotice: MechanicLevelUpNotice | null = null;
  private mechanicLevelUpTimer = 0;
  private mechanicLevelPauseActive = false;
  private remapMapping: { from: SymbolType; to: SymbolType } | null = null;
  private pendingRemapMapping: { from: SymbolType; to: SymbolType } | null = null;
  private memoryRevealTimer = 0;
  private memorySymbolsHidden = false;
  private memoryPreviewDuration = MEMORY_PREVIEW_DURATION;
  private joystickInverted = false;
  private ringRotationOffset = 0;
  private spinState: SpinState | null = null;
  private resolvingAnswer = false;
  private pendingRingLayout: RingLayoutPlan | null = null;
  private lastMechanicSet: MechanicType[] = [];
  private particlesEnabled = true;
  private particlesPersist = false;
  private particleDensity = 4;
  private scoreTracerEnabled = true;
  private scoreTracerCountSetting = SCORE_TRACER_COUNT;
  private scoreTracerThickness = 1;
  private scoreTracerIntensity = 1;
  private mechanicEnabled: Record<Exclude<MechanicType, 'none'>, boolean> = {
    remap: true,
    memory: true,
    joystick: true,
    'match-color': true,
    'match-shape': true
  };
  private scorePulseColor = '#79c0ff';
  private scorePulseTimer = 0;
  private scoreTracers: ScoreTracer[] = [];
  private bonusRingState: BonusRingState = 'idle';
  private bonusRingCharge = 0;
  private bonusRingChargeTarget = 0;
  private bonusRingRotation = 0;
  private bonusRingActiveTimer = 0;
  private bonusRingCooldownTimer = 0;
  private bonusChargePoints = 0;
  private bonusRingColor: RGBColor = cloneColor(DEFAULT_SYMBOL_COLORS[0]);
  private bonusRingColorWeight = 0;
  private bonusScoreMultiplier = 1;
  private leaderboard: HighscoreEntry[] = [];
  private gamePhase: 'idle' | 'attract' | 'playing' | 'name-entry' | 'completed' = 'idle';
  private nameEntryMode: NameEntryMode = 'slots';
  private nameEntrySlots: string[] = Array(NAME_SLOT_COUNT).fill(' ');
  private nameEntryCharIndices: number[] = Array(NAME_SLOT_COUNT).fill(0);
  private nameEntryCursor = 0;
  private nameInputBuffer = '';
  private nameKeyboardRow = 0;
  private nameKeyboardCol = 0;
  private finalScore = 0;
  private finalPlacement: number | null = null;
  private pendingPlacement: number | null = null;
  private finalName: string | null = null;
  private completionListeners: Array<(summary: GameCompletionSummary) => void> = [];

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new Renderer2D(canvas);
    this.timer = new Timer(this.config.duration, this.time);
    this.input = new InputManager();
    this.effects = new EffectsManager();
    this.audio = new AudioSystem();
    this.particles.setAbsorbListener((event) => this.handleParticleAbsorb(event));
    this.particles.setAbsorbThreshold(0.78);
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
    this.initVaultBackdrop();
  }

  onGameComplete(listener: (summary: GameCompletionSummary) => void) {
    this.completionListeners.push(listener);
  }

  private emitGameComplete(summary: GameCompletionSummary) {
    this.completionListeners.forEach((listener) => {
      try {
        listener(summary);
      } catch (err) {
        console.error('[debug] game completion listener error', err);
      }
    });
  }

  private async loadAudio() {
    await Promise.all([
      this.audio.load('correct', correctSfxUrl, 0.5),
      this.audio.load('wrong', wrongSfxUrl, 0.3),
      this.audio.load('gameover', '/sounds/gameover.mp3', 0.6)
    ]);
  }

  private initVaultBackdrop() {
    if (typeof Image === 'undefined') {
      return;
    }
    const image = new Image();
    image.src = dataVaultBackdropUrl;
    image.onload = () => {
      this.vaultBackdropReady = true;
    };
    this.vaultBackdropImage = image;
  }

  private getThemeSymbolSet(): SymbolType[] {
    return SYMBOL_THEME_SETS[this.symbolTheme] ?? SYMBOL_THEME_SETS.classic;
  }

  private applySymbolTheme(theme: SymbolTheme) {
    this.symbolTheme = theme;
    const order = this.getThemeSymbolSet();
    if (order.length === 0) {
      return;
    }
      if (this.symbols.length > 0) {
        this.symbols.forEach((symbol, index) => {
          symbol.type = order[index % order.length] ?? symbol.type;
          symbol.scale = this.ringSymbolScale;
          symbol.rotation = this.ringRotationOffset;
          this.assignSymbolColor(symbol);
        });
        const nextCenter = order[this.currentTargetIndex % order.length] ?? order[0];
        this.applyCenterSymbol(nextCenter, { resetVisual: false });
      if (this.activeMechanics.includes('remap')) {
        this.rollRemapMapping();
      } else {
        this.remapMapping = null;
      }
      this.updateRingLayout();
    } else {
      this.centerSymbol = order[0];
    }
  }
  private getRandomSymbolType(...excludes: (SymbolType | undefined)[]): SymbolType {
    const pool = this.symbols.length > 0 ? this.symbols.map((s) => s.type) : [...this.getThemeSymbolSet()];
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

  private getRandomSymbolColor(): RGBColor {
    const pool = this.symbolColorPool.length > 0 ? this.symbolColorPool : DEFAULT_SYMBOL_COLORS;
    const idx = Math.floor(Math.random() * pool.length);
    const source = pool[idx] ?? DEFAULT_SYMBOL_COLORS[0];
    return cloneColor(source);
  }

  private assignSymbolColor(symbol: Symbol, color?: RGBColor) {
    const base = color ?? this.getRandomSymbolColor();
    symbol.color = cloneColor(base);
  }

  private getColorForSymbolType(type: SymbolType): RGBColor {
    const match = this.symbols.find((symbol) => symbol.type === type && symbol.color);
    if (match && match.color) {
      return cloneColor(match.color);
    }
    return this.getRandomSymbolColor();
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
    const pool: Exclude<MechanicType, 'none'>[] = ['remap', 'memory', 'joystick', 'match-color', 'match-shape'];
    return pool.filter((mechanic) => this.mechanicEnabled[mechanic]);
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
    const order = this.getThemeSymbolSet();
    if (order.length === 0) {
      return;
    }
    this.symbols.forEach((symbol, index) => {
      const type = order[index % order.length] ?? symbol.type;
      symbol.type = type;
      symbol.scale = this.ringSymbolScale;
      symbol.rotation = 0;
      this.assignSymbolColor(symbol);
    });
    this.updateRingLayout();
  }

  private applySpinShuffle(opts?: { animate?: boolean; centerType?: SymbolType; matchModeOverride?: MatchMechanicMode | null }) {
    if (this.symbols.length === 0) return;
    const targetCenter = opts?.centerType ?? this.centerSymbol;
    const matchMode = opts?.matchModeOverride ?? this.getMatchMechanicMode();
    const baseColor = targetCenter === this.centerSymbol ? this.centerSymbolColor : null;
    const plan = this.buildRingLayoutPlan(targetCenter, matchMode, { baseColor });
    if (!plan) return;

    const applyPlanToRing = () => {
      plan.apply();
      if (targetCenter === this.centerSymbol) {
        this.centerSymbolColor = cloneColor(plan.centerColor);
        this.currentTargetIndex = plan.correctIndex;
      }
    };

    const animate = opts?.animate !== false;
    if (animate) {
      if (targetCenter !== this.centerSymbol) {
        this.pendingRingLayout = plan;
      } else {
        this.pendingRingLayout = null;
      }
      this.startSpinAnimation(undefined, { onSwap: () => applyPlanToRing() });
      return;
    }

    applyPlanToRing();
    if (targetCenter !== this.centerSymbol) {
      this.pendingRingLayout = plan;
    } else {
      this.pendingRingLayout = null;
    }
  }

  private startSpinAnimation(targetTypes?: SymbolType[], opts?: { onSwap?: () => void }) {
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
      velocity: 0,
      onSwap: opts?.onSwap ?? null
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
      if (typeof state.onSwap === 'function') {
        state.onSwap();
      } else if (state.targetTypes) {
        this.symbols.forEach((symbol, index) => {
          symbol.type = state.targetTypes?.[index] ?? symbol.type;
          this.assignSymbolColor(symbol);
        });
      }
      state.swapDone = true;
    }

    if (progress >= 1) {
      this.cancelSpinAnimation(rotation);
    }
  }

  private updateBonusRing(dt: number) {
    const state = this.bonusRingState;
    const target = clamp(this.bonusRingChargeTarget, 0, 1);
    const chargeDelta = target - this.bonusRingCharge;
    if (Math.abs(chargeDelta) > 0.0001) {
      const smoothing = state === 'active' ? 10 : 6;
      const factor = Math.min(1, dt * smoothing);
      this.bonusRingCharge += chargeDelta * factor;
    } else {
      this.bonusRingCharge = target;
    }

    const effectiveCharge = state === 'active' ? 1 : Math.max(this.bonusRingCharge, target);
    let rotationSpeed = BONUS_ROTATION_BASE + BONUS_ROTATION_EXTRA * effectiveCharge;
    if (state === 'ready') {
      rotationSpeed += 0.7;
    } else if (state === 'active') {
      rotationSpeed += 1.2;
    }
    this.bonusRingRotation = (this.bonusRingRotation + rotationSpeed * dt) % TAU;

    if ((state === 'charging' || state === 'ready') && target >= 0.995) {
      this.bonusRingState = 'ready';
    } else if (state === 'ready' && target < 0.9) {
      this.bonusRingState = target <= 0 ? 'idle' : 'charging';
    } else if (state === 'charging' && target <= 0.001) {
      this.bonusRingState = 'idle';
    }

    if (state === 'active') {
      if (this.bonusRingActiveTimer > 0) {
        this.bonusRingActiveTimer = Math.max(0, this.bonusRingActiveTimer - dt);
        const drainRate = dt / Math.max(0.001, BONUS_ACTIVE_DURATION);
        this.bonusRingChargeTarget = clamp(this.bonusRingChargeTarget - drainRate, 0, 1);
      }
      if (this.bonusRingActiveTimer <= 0) {
        this.endBonusRing();
      }
    } else if (state === 'cooldown') {
      if (this.bonusRingCooldownTimer > 0) {
        this.bonusRingCooldownTimer = Math.max(0, this.bonusRingCooldownTimer - dt);
      }
      if (this.bonusRingCooldownTimer <= 0) {
        this.resetBonusRing();
      }
    }
  }

  private getBonusChargeThreshold(): number {
    switch (this.difficulty) {
      case 'easy':
        return 10;
      case 'hard':
        return 30;
      case 'progressive':
        return 20;
      case 'medium':
      default:
        return 20;
    }
  }

  private getBonusPenaltyAmount(): number {
    switch (this.difficulty) {
      case 'easy':
        return 5;
      case 'medium':
      case 'progressive':
        return 10;
      case 'hard':
      default:
        return Number.POSITIVE_INFINITY;
    }
  }

  private syncBonusChargeTarget() {
    const threshold = this.getBonusChargeThreshold();
    if (threshold <= 0) {
      this.bonusRingChargeTarget = 0;
      return;
    }
    const ratio = clamp(this.bonusChargePoints / threshold, 0, 1);
    this.bonusRingChargeTarget = ratio;
  }

  private addBonusChargeProgress(amount = 1) {
    const threshold = this.getBonusChargeThreshold();
    if (threshold <= 0 || amount <= 0) {
      return;
    }
    if (this.bonusRingState === 'active' || this.bonusRingState === 'cooldown') {
      return;
    }
    this.bonusChargePoints = Math.min(threshold, this.bonusChargePoints + amount);
    if (this.bonusChargePoints > 0 && this.bonusRingState === 'idle') {
      this.bonusRingState = 'charging';
    }
    this.syncBonusChargeTarget();
  }

  private tryActivateBonusRing(): boolean {
    if (this.gamePhase !== 'playing') {
      return false;
    }
    if (this.bonusRingState !== 'ready') {
      return false;
    }
    this.activateBonusRing();
    return true;
  }

  private activateBonusRing() {
    if (this.bonusRingState !== 'ready') {
      return;
    }
    this.bonusRingState = 'active';
    this.bonusRingActiveTimer = BONUS_ACTIVE_DURATION;
    this.bonusRingCharge = 1;
    this.bonusRingChargeTarget = 1;
    this.bonusChargePoints = this.getBonusChargeThreshold();
    this.bonusScoreMultiplier = BONUS_SCORE_MULTIPLIER;
    const flashColor = rgbToCss(this.bonusRingColor, 0.4);
    this.effects.flash(flashColor, 0.25, 0.35);
  }

  private endBonusRing() {
    if (this.bonusRingState !== 'active') {
      return;
    }
    this.bonusRingState = 'cooldown';
    this.bonusRingActiveTimer = 0;
    this.bonusRingCooldownTimer = BONUS_COOLDOWN_DURATION;
    this.bonusRingChargeTarget = 0;
    this.bonusChargePoints = 0;
    this.bonusScoreMultiplier = 1;
    this.syncBonusChargeTarget();
    this.resetBonusRingColor();
  }

  private rollRemapMapping() {
    const availableSet = this.symbols.length > 0 ? this.symbols.map((s) => s.type) : [...this.getThemeSymbolSet()];
    const uniqueAvailable = Array.from(new Set(availableSet));
    if (uniqueAvailable.length < 2) {
      this.remapMapping = null;
      this.pendingRemapMapping = null;
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

    const mapping = { from, to };
    if (this.resolvingAnswer || this.anim.isActive()) {
      this.pendingRemapMapping = mapping;
    } else {
      this.applyRemapMapping(mapping);
    }
  }

  private getExpectedSymbolType(): SymbolType {
    if (this.activeMechanics.includes('remap') && this.remapMapping) {
      if (this.centerSymbol === this.remapMapping.from) {
        return this.remapMapping.to;
      }
    }
    return this.centerSymbol;
  }

  private applyRemapMapping(mapping: { from: SymbolType; to: SymbolType }) {
    this.remapMapping = { ...mapping };
    this.pendingRemapMapping = null;
    this.mechanicBannerText = null;
  }

  private flushPendingRemapMapping() {
    if (!this.pendingRemapMapping) {
      return;
    }
    if (this.resolvingAnswer || this.anim.isActive()) {
      return;
    }
    this.applyRemapMapping(this.pendingRemapMapping);
  }

  private getMatchMechanicMode(): MatchMechanicMode | null {
    const active = this.activeMechanics.find(
      (type): type is MatchMechanicMode => type === 'match-color' || type === 'match-shape'
    );
    return active ?? null;
  }

  private pickColorExcluding(exclusions: RGBColor[]): RGBColor {
    const pool = this.symbolColorPool.length > 0 ? this.symbolColorPool : DEFAULT_SYMBOL_COLORS;
    const filtered = pool.filter((candidate) => !exclusions.some((exclude) => colorsEqual(candidate, exclude)));
    const fallback = pool[0] ?? DEFAULT_SYMBOL_COLORS[0];
    const source = this.randomChoice(filtered.length > 0 ? filtered : pool, fallback);
    return cloneColor(source);
  }

  private getUniqueThemeTypes(): SymbolType[] {
    const themeTypes = this.getThemeSymbolSet();
    const base = themeTypes.length > 0 ? themeTypes : SYMBOL_THEME_SETS.classic;
    const seen = new Set<SymbolType>();
    const unique: SymbolType[] = [];
    base.forEach((type) => {
      if (!seen.has(type)) {
        unique.push(type);
        seen.add(type);
      }
    });
    return unique;
  }

  private pickUniqueSymbolTypes(count: number, exclusions: SymbolType[] = []): SymbolType[] {
    const excludeSet = new Set(exclusions);
    const uniqueTypes = this.shuffleArray(this.getUniqueThemeTypes());
    const result: SymbolType[] = [];
    const pushIfAvailable = (type: SymbolType | undefined) => {
      if (!type || excludeSet.has(type) || result.includes(type)) return;
      result.push(type);
    };
    uniqueTypes.forEach((type) => pushIfAvailable(type));
    if (result.length < count) {
      SYMBOL_THEME_SETS.classic.forEach((type) => pushIfAvailable(type));
    }
    let cursor = 0;
    while (result.length < count && uniqueTypes.length > 0) {
      const candidate = uniqueTypes[cursor % uniqueTypes.length];
      if (candidate) {
        result.push(candidate);
      }
      cursor += 1;
    }
    return result.slice(0, count);
  }

  private pickUniqueColors(count: number, exclusions: RGBColor[] = []): RGBColor[] {
    const result: RGBColor[] = [];
    const used = exclusions.slice();
    for (let i = 0; i < count; i += 1) {
      const color = this.pickColorExcluding(used);
      result.push(color);
      used.push(color);
    }
    return result;
  }

  private createRingAssignments(
    centerType: SymbolType,
    centerColor: RGBColor,
    matchMode: MatchMechanicMode | null,
    slotCount: number
  ): RingAssignment[] {
    switch (matchMode) {
      case 'match-color':
        return this.createMatchColorAssignments(centerType, centerColor, slotCount);
      case 'match-shape':
        return this.createMatchShapeAssignments(centerType, centerColor, slotCount);
      default:
        return this.createStandardAssignments(centerType, centerColor, slotCount);
    }
  }

  private createStandardAssignments(centerType: SymbolType, centerColor: RGBColor, slotCount: number): RingAssignment[] {
    const assignments: RingAssignment[] = [
      { role: 'correct', type: centerType, color: cloneColor(centerColor) }
    ];
    const distractorTypes = this.pickUniqueSymbolTypes(Math.max(0, slotCount - 1), [centerType]);
    const distractorColors = this.pickUniqueColors(Math.max(0, slotCount - 1), [centerColor]);
    distractorTypes.forEach((type, idx) => {
      const color = distractorColors[idx] ?? this.pickColorExcluding([centerColor, ...distractorColors]);
      assignments.push({ role: 'filler', type, color });
    });
    while (assignments.length < slotCount) {
      const fallbackColor = this.pickColorExcluding([centerColor, ...assignments.map((spec) => spec.color)]);
      assignments.push({ role: 'filler', type: centerType, color: fallbackColor });
    }
    return assignments.slice(0, slotCount);
  }

  private createMatchColorAssignments(centerType: SymbolType, centerColor: RGBColor, slotCount: number): RingAssignment[] {
    const assignments: RingAssignment[] = [];
    const correctType = this.pickUniqueSymbolTypes(1, [centerType])[0] ?? centerType;
    assignments.push({ role: 'correct', type: correctType, color: cloneColor(centerColor) });

    const nonCenterColors = this.pickUniqueColors(Math.max(0, slotCount - 1), [centerColor]);
    const shapeBaitColor = nonCenterColors.shift() ?? this.pickColorExcluding([centerColor]);
    assignments.push({ role: 'bait', type: centerType, color: shapeBaitColor });

    const remainingTypes = this.pickUniqueSymbolTypes(Math.max(0, slotCount - 2), [centerType, correctType]);
    remainingTypes.forEach((type, idx) => {
      const color = nonCenterColors[idx] ?? this.pickColorExcluding([centerColor, shapeBaitColor, ...nonCenterColors]);
      assignments.push({ role: 'filler', type, color });
    });
    while (assignments.length < slotCount) {
      const color = this.pickColorExcluding([centerColor, shapeBaitColor, ...assignments.map((spec) => spec.color)]);
      const type = this.pickUniqueSymbolTypes(1, [centerType, correctType, ...assignments.map((spec) => spec.type)])[0] ?? centerType;
      assignments.push({ role: 'filler', type, color });
    }
    return assignments.slice(0, slotCount);
  }

  private createMatchShapeAssignments(centerType: SymbolType, centerColor: RGBColor, slotCount: number): RingAssignment[] {
    const assignments: RingAssignment[] = [];
    const correctColor = this.pickColorExcluding([centerColor]);
    assignments.push({ role: 'correct', type: centerType, color: correctColor });

    const colorBaitType = this.pickUniqueSymbolTypes(1, [centerType])[0] ?? centerType;
    assignments.push({ role: 'bait', type: colorBaitType, color: cloneColor(centerColor) });

    const remainingTypes = this.pickUniqueSymbolTypes(Math.max(0, slotCount - 2), [centerType, colorBaitType]);
    const fillerColors = this.pickUniqueColors(Math.max(0, slotCount - 2), [centerColor, correctColor]);
    remainingTypes.forEach((type, idx) => {
      const color = fillerColors[idx] ?? this.pickColorExcluding([centerColor, correctColor, ...fillerColors]);
      assignments.push({ role: 'filler', type, color });
    });
    while (assignments.length < slotCount) {
      const color = this.pickColorExcluding([centerColor, correctColor, ...assignments.map((spec) => spec.color)]);
      const type = this.pickUniqueSymbolTypes(1, [centerType, colorBaitType, ...assignments.map((spec) => spec.type)])[0] ?? colorBaitType;
      assignments.push({ role: 'filler', type, color });
    }
    return assignments.slice(0, slotCount);
  }

  private buildRingLayoutPlan(
    centerType: SymbolType,
    matchMode: MatchMechanicMode | null,
    opts?: { baseColor?: RGBColor | null }
  ): RingLayoutPlan | null {
    if (this.symbols.length === 0) {
      return null;
    }
    const slotCount = this.symbols.length;
    const baseColor = opts?.baseColor ? cloneColor(opts.baseColor) : this.pickColorExcluding([]);
    const assignments = this.createRingAssignments(centerType, baseColor, matchMode, slotCount);
    const randomized = this.shuffleArray(assignments);
    const plan: RingLayoutPlan = {
      centerType,
      centerColor: cloneColor(baseColor),
      correctIndex: Math.max(0, randomized.findIndex((spec) => spec.role === 'correct')),
      matchMode,
      applied: false,
      apply: () => {
        randomized.forEach((spec, idx) => {
          const symbol = this.symbols[idx];
          if (!symbol) return;
          symbol.type = spec.type;
          this.assignSymbolColor(symbol, spec.color);
          symbol.scale = this.ringSymbolScale;
          symbol.rotation = 0;
        });
        this.updateRingLayout();
        plan.applied = true;
      }
    };
    if (plan.correctIndex < 0) {
      plan.correctIndex = 0;
    }
    return plan;
  }


  private isMatchColorCorrect(symbol: Symbol): boolean {
    return !!symbol.color && colorsEqual(symbol.color, this.centerSymbolColor) && symbol.type !== this.centerSymbol;
  }

  private isMatchShapeCorrect(symbol: Symbol): boolean {
    return symbol.type === this.centerSymbol;
  }

  private mapInputDirection(dir: Direction): Direction {
    if (!this.activeMechanics.includes('joystick') || !this.joystickInverted) {
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

  private restartMemoryPreview() {
    this.memorySymbolsHidden = false;
    this.memoryRevealTimer = this.memoryPreviewDuration;
    this.ensureMemoryMessage();
  }

  private handlePostAnswerLayoutChange(nextCenter: SymbolType) {
    this.applySpinShuffle({ centerType: nextCenter });
    if (this.activeMechanics.includes('memory')) {
      this.restartMemoryPreview();
    }
  }

  private startProgressiveLevelAnnouncement(block: number, mechanicCount: number) {
    const tier = Math.max(1, block);
    const increase = mechanicCount - this.progressiveMechanicLimit;
    const slots = Math.max(0, mechanicCount);
    const headline =
      slots <= 0
        ? 'Mechanics paused'
        : increase > 0
          ? `+${increase} slot${increase === 1 ? '' : 's'} unlocked`
          : 'Rotation intensifies';
    const summary =
      slots <= 0
        ? 'Modifiers will stay inactive for a moment.'
        : slots === 1
          ? '1 mechanic is now in rotation.'
          : `${slots} mechanics now rotate together.`;
    const detail =
      slots <= 0
        ? 'Use the breather to rebuild your streak.'
        : increase > 0
          ? 'A new modifier can appear immediately.'
          : 'Existing modifiers will overlap more often.';
    this.mechanicLevelUpNotice = {
      tier,
      slots,
      headline,
      summary,
      detail,
      cta: 'Press Enter to continue'
    };
    this.mechanicLevelUpTimer = PROGRESSIVE_LEVEL_NOTICE_DURATION;
    if (!this.mechanicLevelPauseActive) {
      this.pauseLayer();
      this.mechanicLevelPauseActive = true;
    }
  }

  private clearProgressiveLevelAnnouncement() {
    if (this.mechanicLevelPauseActive) {
      this.resumeLayer();
      this.mechanicLevelPauseActive = false;
    }
    this.mechanicLevelUpNotice = null;
    this.mechanicLevelUpTimer = 0;
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
      case 'memory':
        if (this.resolvingAnswer) {
          break;
        }
        this.applySpinShuffle();
        this.restartMemoryPreview();
        break;
      case 'joystick':
        this.joystickInverted = true;
        break;
      case 'match-color':
      case 'match-shape':
        this.applyCenterSymbol(this.centerSymbol, { resetVisual: false });
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
        this.pendingRemapMapping = null;
        break;
      case 'memory':
        this.memorySymbolsHidden = false;
        this.memoryRevealTimer = 0;
        break;
      case 'joystick':
        this.joystickInverted = false;
        break;
      case 'match-color':
      case 'match-shape':
        this.applyDefaultRingOrder();
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
      case 'memory':
        return 'Remember layout';
      case 'joystick':
        return 'Joystick Flip';
      case 'match-color':
        return 'Match Color';
      case 'match-shape':
        return 'Match Shape';
      default:
        return null;
    }
  }

  private setActiveMechanics(next: MechanicType[]) {
    let unique = Array.from(
      new Set(
        next.filter((type): type is Exclude<MechanicType, 'none'> => isToggleMechanic(type) && this.mechanicEnabled[type])
      )
    );
    const matchMechanics: MatchMechanicMode[] = ['match-color', 'match-shape'];
    const activeMatch = unique.find((type): type is MatchMechanicMode =>
      matchMechanics.includes(type as MatchMechanicMode)
    );
    if (activeMatch) {
      unique = [activeMatch];
    }
    const currentActive = this.activeMechanics.filter(isToggleMechanic);
    const removed = currentActive.filter((type) => !unique.includes(type));
    const added = unique.filter((type) => !currentActive.includes(type));

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
      case 'memory':
        if (!this.resolvingAnswer) {
          this.restartMemoryPreview();
        }
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
    const targetCountRaw = this.getProgressiveMechanicCount(block, enabledMechanics.length);
    const targetCount = Math.max(0, Math.min(targetCountRaw, enabledMechanics.length));
    if (targetCount > this.progressiveMechanicLimit) {
      this.startProgressiveLevelAnnouncement(block, targetCount);
    }
    this.progressiveMechanicLimit = targetCount;

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
    const matchMode = this.getMatchMechanicMode();
    this.applyDefaultRingOrder();
    if (matchMode) {
      this.applyCenterSymbol(this.centerSymbol, { resetVisual: false });
      this.memorySymbolsHidden = false;
      this.memoryRevealTimer = 0;
      this.joystickInverted = false;
      return;
    }
    const memoryActive = this.activeMechanics.includes('memory');
    if (memoryActive) {
      if (!this.resolvingAnswer) {
        this.applySpinShuffle();
        this.restartMemoryPreview();
      }
    } else {
      this.memorySymbolsHidden = false;
      this.memoryRevealTimer = 0;
    }
    if (!this.activeMechanics.includes('joystick')) {
      this.joystickInverted = false;
    }
  }

  private applyCenterSymbol(next: SymbolType, opts?: { resetVisual?: boolean }) {
    const previousCenter = this.centerSymbol;
    this.centerSymbol = next;
    const matchMode = this.getMatchMechanicMode();
    let plan: RingLayoutPlan | null = null;
    const pendingMatch = this.pendingRingLayout && this.pendingRingLayout.centerType === next;
    if (pendingMatch) {
      plan = this.pendingRingLayout;
      this.pendingRingLayout = null;
    } else {
      const baseColor = next === previousCenter ? this.centerSymbolColor : null;
      plan = this.buildRingLayoutPlan(next, matchMode, { baseColor }) ?? null;
    }
    if (plan && !plan.applied && !pendingMatch) {
      plan.apply();
    }
    if (plan) {
      this.centerSymbolColor = cloneColor(plan.centerColor);
      this.currentTargetIndex = plan.correctIndex;
    } else {
      this.currentTargetIndex = 0;
      this.centerSymbolColor = this.centerSymbolColor ?? this.getRandomSymbolColor();
    }
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
    this.leaderboard = list;
    this.highscore = list.length > 0 ? list[0].score : Math.max(this.highscore, 0);
  }

  getLeaderboardSnapshot(): HighscoreEntry[] {
    return this.leaderboard.map((entry) => ({ ...entry }));
  }

  private recordScore(entry: HighscoreEntry): number {
    if (!this.highscoreStore) return Number.POSITIVE_INFINITY;
    const placement = this.highscoreStore.save(entry);
    this.leaderboard = this.highscoreStore.list();
    this.highscore =
      this.leaderboard.length > 0
        ? this.leaderboard[0].score
        : Math.max(this.highscore, entry.score);
    return placement;
  }

  private sanitizePlayerName(name: string) {
    const normalized = (name ?? '').toString().toUpperCase();
    const filtered = normalized.replace(/[^A-Z0-9 ]+/g, '');
    const trimmed = filtered.trim();
    const truncated = trimmed.slice(0, NAME_SLOT_COUNT);
    return truncated.length > 0 ? truncated : 'PLAYER';
  }

  private updateSlotsFromBuffer(buffer: string) {
    const normalized = buffer.slice(0, NAME_SLOT_COUNT);
    const slots = Array(NAME_SLOT_COUNT).fill(' ');
    for (let i = 0; i < normalized.length; i += 1) {
      slots[i] = normalized[i];
    }
    this.nameEntrySlots = slots;
  }

  resetHighscore() {
    this.highscoreStore?.clear();
    this.syncHighscore();
  }

  enterAttractMode() {
    this.gamePhase = 'attract';
    this.attractStartRequested = false;
    this.attractStartRect = null;
    this.attractPulseTime = 0;
    this.attractSymbols = [];
    this.introTransition = null;
    this.time.set(0);
    this.timer.set(this.config.duration);
    this.resetBonusRing();
    this.clock.stop();
    this.clock.start((dt) => this.update(dt));
  }

  handleAttractAction(action: Action, actions: { onStart: () => void }): boolean {
    if (this.gamePhase !== 'attract') {
      return false;
    }
    if (action === 'confirm') {
      this.attractStartRequested = true;
      actions.onStart();
      return true;
    }
    return false;
  }

  handleAttractClick(x: number, y: number, actions: { onStart: () => void }): boolean {
    if (this.gamePhase !== 'attract') {
      return false;
    }
    if (this.attractStartRect && this.pointInRect(x, y, this.attractStartRect)) {
      this.attractStartRequested = true;
      actions.onStart();
      return true;
    }
    return false;
  }

  private showTimeDelta(delta: number) {
    this.timeDeltaValue = delta;
    this.timeDeltaTimer = TIME_DELTA_DISPLAY_SEC;
  }

  refreshSettings(config?: PersistentConfig) {
    const data = config ?? this.configStore?.load() ?? {};
    const legacyConfig = data as PersistentConfig & {
      particlesEnabled?: boolean;
      scoreRayEnabled?: boolean;
    };
    const themeSetting: SymbolTheme = data.symbolTheme === 'pacman' ? 'pacman' : 'classic';
    const requestedTimeMode = data.timeBonusMode;
    const timeBonusMode: TimeBonusMode =
      requestedTimeMode === 'endurance' || requestedTimeMode === 'hybrid' ? requestedTimeMode : 'classic';
    const merged: GameConfig = {
      ...this.defaults,
      duration: clamp(data.initialTime ?? this.defaults.duration, 15, 300),
      timePenalty: this.defaults.timePenalty,
      symbolCount: this.defaults.symbolCount,
      maxTimeBonus: clamp(data.maxTimeBonus ?? this.defaults.maxTimeBonus, 0.5, 6),
      minTimeBonus: clamp(data.minTimeBonus ?? this.defaults.minTimeBonus, 0.1, 5),
      bonusWindow: clamp(data.bonusWindow ?? this.defaults.bonusWindow, 0.5, 6),
      timeBonusMode,
      ringRadiusFactor: clamp(data.ringRadiusFactor ?? this.defaults.ringRadiusFactor, 0.08, 0.3),
      symbolScale: clamp(data.symbolScale ?? this.defaults.symbolScale, 0.6, 1.6),
      symbolStroke: clamp(data.symbolStroke ?? this.defaults.symbolStroke, 0.5, 1.8),
      symbolTheme: themeSetting,
    };
    // Ensure floor is not above ceiling
    if (merged.minTimeBonus > merged.maxTimeBonus) {
      merged.minTimeBonus = merged.maxTimeBonus;
    }
    this.config = merged;
    const sanitizedColors = sanitizeSymbolColors(data.symbolColors);
    this.symbolColorPool = sanitizedColors;
    this.menuColorPool = sanitizedColors.map(cloneColor);

    this.ringSymbolScale = BASE_RING_SYMBOL_SCALE * merged.symbolScale;
    this.centerBaseScale = BASE_CENTER_SCALE * merged.symbolScale;
    this.centerMinScale = this.centerBaseScale * CENTER_MIN_RATIO;
    this.centerScale = this.centerBaseScale;
    this.symbolStrokeScale = merged.symbolStroke;
    this.applySymbolTheme(themeSetting);
    this.attractVisualConfig = {
      symbolTheme: themeSetting,
      count: clamp(
        typeof data.menuSymbolCount === 'number' ? Math.round(data.menuSymbolCount) : this.attractVisualConfig.count,
        MENU_MIN_SYMBOLS,
        MENU_MAX_SYMBOLS
      ),
      baseSizeVW: clamp(
        typeof data.menuSymbolBaseSizeVW === 'number' ? data.menuSymbolBaseSizeVW : this.attractVisualConfig.baseSizeVW,
        0.5,
        20
      ),
      sizeVariancePct: clamp(
        typeof data.menuSymbolSizeVariancePct === 'number'
          ? data.menuSymbolSizeVariancePct
          : this.attractVisualConfig.sizeVariancePct,
        0,
        100
      ),
      growthMultiplier: clamp(
        typeof data.menuSymbolGrowthMultiplier === 'number'
          ? data.menuSymbolGrowthMultiplier
          : this.attractVisualConfig.growthMultiplier,
        1,
        30
      ),
      speedMultiplier: clamp(
        typeof data.menuSymbolSpeedMultiplier === 'number'
          ? data.menuSymbolSpeedMultiplier
          : this.attractVisualConfig.speedMultiplier,
        0.3,
        2.5
      )
    };
    if (!this.symbols.length) {
      this.centerSymbolColor = this.getRandomSymbolColor();
    }

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
    if (this.difficulty !== 'progressive') {
      this.progressiveMechanicLimit = 0;
      this.clearProgressiveLevelAnnouncement();
    }
    if (difficultyChanged) {
      const threshold = this.getBonusChargeThreshold();
      this.bonusChargePoints = Math.min(this.bonusChargePoints, threshold);
      if (this.bonusRingState !== 'active' && this.bonusRingState !== 'cooldown') {
        this.bonusRingState = this.bonusChargePoints > 0 ? 'charging' : 'idle';
      }
      this.syncBonusChargeTarget();
    }
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
    if (legacyConfig.particlesEnabled === false) {
      this.particleDensity = 0;
    }
    this.particlesEnabled = this.particleDensity > 0;
    const particlesPersistSetting = data.particlesPersist;
    this.particlesPersist = Boolean(particlesPersistSetting);
    this.particles.setDespawnEnabled(!this.particlesPersist);
    if (!this.particlesEnabled) {
      this.particles.clear();
    }

    const tracerCountSetting = typeof data.scoreRayCount === 'number' ? data.scoreRayCount : this.scoreTracerCountSetting;
    this.scoreTracerCountSetting = clamp(tracerCountSetting, 0, 12);
    if (legacyConfig.scoreRayEnabled === false) {
      this.scoreTracerCountSetting = 0;
    }
    this.scoreTracerEnabled = this.scoreTracerCountSetting > 0;
    const tracerThicknessSetting = typeof data.scoreRayThickness === 'number' ? data.scoreRayThickness : this.scoreTracerThickness;
    this.scoreTracerThickness = clamp(tracerThicknessSetting, 0.2, 3);
    const tracerIntensitySetting = typeof data.scoreRayIntensity === 'number' ? data.scoreRayIntensity : this.scoreTracerIntensity;
    this.scoreTracerIntensity = clamp(tracerIntensitySetting, 0.3, 2.5);
    if (!this.scoreTracerEnabled) {
      this.scoreTracers = [];
    }

    const nameEntryModeSetting =
      data.nameEntryMode === 'keyboard' ? 'keyboard' : 'slots';
    this.nameEntryMode = nameEntryModeSetting;

    const nextMechanicEnabled: typeof this.mechanicEnabled = {
      remap: data.mechanicEnableRemap !== false,
      memory: data.mechanicEnableMemory !== false,
      joystick: data.mechanicEnableJoystick !== false,
      'match-color': data.mechanicEnableMatchColor !== false,
      'match-shape': data.mechanicEnableMatchShape !== false
    };
    const mechanicsChanged = (Object.keys(nextMechanicEnabled) as Array<keyof typeof nextMechanicEnabled>).some(
      (key) => this.mechanicEnabled[key] !== nextMechanicEnabled[key]
    );
    this.mechanicEnabled = nextMechanicEnabled;
    if (mechanicsChanged) {
      const filtered = this.activeMechanics.filter((type): type is Exclude<MechanicType, 'none'> => isToggleMechanic(type) && this.mechanicEnabled[type]);
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

  private drawBonusRing(ctx: CanvasRenderingContext2D) {
    const center = this.playfieldCenter.x || this.playfieldCenter.y
      ? this.playfieldCenter
      : this.getCanvasCenter();
    const state = this.bonusRingState;
    const charge = clamp(this.bonusRingCharge, 0, 1);
    const displayedCharge = state === 'active'
      ? 1
      : Math.max(charge, this.bonusRingChargeTarget);
    const baseRadius = this.getRingRadius();
    const outerRadius = baseRadius * (1.05 + displayedCharge * 0.22 + (state === 'active' ? 0.08 : 0));
    const rotationOffset = this.bonusRingRotation * 0.02;
    const globalAlpha = state === 'cooldown'
      ? Math.max(0, this.bonusRingCooldownTimer / BONUS_COOLDOWN_DURATION)
      : 1;
    const hex = rgbToHex(this.bonusRingColor);
    const now = this.time.get();
    const pulse = state === 'active' ? (Math.sin(now * 8) + 1) / 2 : 0;
    const baseStroke = Math.max(2, baseRadius * 0.025);

    ctx.save();
    ctx.translate(center.x, center.y);
    ctx.globalAlpha = globalAlpha;
    ctx.lineCap = 'round';

    ctx.strokeStyle = colorWithAlpha(hex, 0.1, 0.05);
    ctx.lineWidth = Math.max(1, baseStroke * 0.7);
    ctx.shadowBlur = 0;
    ctx.beginPath();
    ctx.arc(0, 0, outerRadius, 0, TAU);
    ctx.stroke();

    const segmentCount = 12;
    const gap = TAU * 0.02;
    const usableArc = TAU - segmentCount * gap;
    const segmentSpan = usableArc / segmentCount;
    ctx.lineWidth = baseStroke;

    for (let i = 0; i < segmentCount; i += 1) {
      const start = rotationOffset + i * (segmentSpan + gap) - Math.PI / 2;
      const end = start + segmentSpan;
      ctx.shadowBlur = 0;
      ctx.strokeStyle = colorWithAlpha(hex, 0.12, 0.05);
      ctx.beginPath();
      ctx.arc(0, 0, outerRadius, start, end);
      ctx.stroke();

      const fill = clamp(displayedCharge * segmentCount - i, 0, 1);
      if (fill <= 0) {
        continue;
      }
      ctx.strokeStyle = colorWithAlpha(hex, 0.45 + fill * 0.55, 0.35 + pulse * 0.2);
      ctx.lineWidth = baseStroke * (1.15 + fill * 0.7 + (state === 'active' ? 0.35 : 0));
      ctx.shadowColor = colorWithAlpha(hex, 0.35 + fill * 0.6, 0.5 + pulse * 0.35);
      ctx.shadowBlur = 12 + fill * 25 + (state === 'active' ? 10 : 0);
      ctx.beginPath();
      ctx.arc(0, 0, outerRadius, start, start + segmentSpan * fill);
      ctx.stroke();
    }

    ctx.globalAlpha = Math.max(0, (state === 'active' ? 0.35 : 0.2) + displayedCharge * 0.15);
    ctx.lineWidth = Math.max(1, baseStroke * 0.25);
    ctx.strokeStyle = colorWithAlpha(hex, 0.4 + pulse * 0.2, 0.35);
    ctx.beginPath();
    ctx.arc(0, 0, outerRadius + baseStroke * 0.8, 0, TAU);
    ctx.stroke();
    ctx.restore();
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
    const reactionRatio = clamp(1 - reaction / window, 0, 1);
    const duration = Math.max(0.0001, this.config.duration);
    const timeRatio = clamp(this.timer.get() / duration, 0, 1);
    const deficitRatio = clamp(
      (TIMEBAR_TARGET_RATIO - timeRatio) / TIMEBAR_TARGET_RATIO,
      0,
      1
    );

    let mix = reactionRatio;
    switch (this.config.timeBonusMode) {
      case 'endurance':
        mix = deficitRatio;
        break;
      case 'hybrid':
        mix = clamp((reactionRatio + deficitRatio) / 2, 0, 1);
        break;
      case 'classic':
      default:
        mix = reactionRatio;
        break;
    }
    return clamp(floor + (maxBonus - floor) * mix, floor, maxBonus);
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
            this.flushPendingRemapMapping();
          }
        });
      }
    });
  }

  onKeyDown(e: KeyboardEvent) {
    if (this.gamePhase === 'name-entry') {
      if (this.nameEntryMode === 'keyboard') {
        this.handleKeyboardNameEntryInput(e);
      } else {
        this.handleSlotNameEntryInput(e);
      }
      return;
    }
    if (this.gamePhase !== 'playing') {
      if (['ArrowUp', 'ArrowRight', 'ArrowDown', 'ArrowLeft', 'Enter'].includes(e.key)) {
        e.preventDefault();
      }
      return;
    }
    if (this.mechanicLevelUpNotice) {
      if (e.key === 'Enter') {
        this.clearProgressiveLevelAnnouncement();
      }
      e.preventDefault();
      return;
    }
    if (e.key === 'Enter') {
      const activated = this.tryActivateBonusRing();
      if (activated) {
        e.preventDefault();
        return;
      }
    }
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
      case 'ArrowUp':
        inputDir = 'up';
        e.preventDefault();
        break;
      case 'ArrowRight':
        inputDir = 'right';
        e.preventDefault();
        break;
      case 'ArrowDown':
        inputDir = 'down';
        e.preventDefault();
        break;
      case 'ArrowLeft':
        inputDir = 'left';
        e.preventDefault();
        break;
    }

    if (inputDir !== null) {
      this.handleInput(inputDir);
    }
  }

  private handleInput(inputDir: Direction) {
    if (this.introTransition) {
      return;
    }
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

    const matchMode = this.getMatchMechanicMode();
    const expectedType = matchMode ? null : this.getExpectedSymbolType();
    console.log(
      '[debug] centerSymbol',
      this.centerSymbol,
      'mode',
      matchMode ?? 'shape',
      'expectedType',
      expectedType,
      'ringSymbol',
      ringSymbol.type,
      'ringColor',
      ringSymbol.color,
      'centerColor',
      this.centerSymbolColor,
      'remap',
      this.remapMapping
    );

    const isCorrect = matchMode === 'match-color'
      ? this.isMatchColorCorrect(ringSymbol)
      : matchMode === 'match-shape'
        ? this.isMatchShapeCorrect(ringSymbol)
        : ringSymbol.type === expectedType;

    if (isCorrect) {
      // Correct answer
      this.handleCorrectSelection(ringSymbol);
    } else {
      this.handleWrongSelection(ringSymbol);
    }

    // Update HUD (score will be drawn on the canvas in draw())
  }

  private handleCorrectSelection(ringSymbol: Symbol) {
    this.resolvingAnswer = true;
    try {
      const baseScore = 100;
      const scoreGain = Math.round(baseScore * this.bonusScoreMultiplier);
      this.score += scoreGain;
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
      this.addBonusChargeProgress();

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
      this.handlePostAnswerLayoutChange(next);
    } finally {
      this.resolvingAnswer = false;
    }
  }

  private handleWrongSelection(ringSymbol: Symbol) {
    this.resolvingAnswer = true;
    try {
      this.timer.add(-this.config.timePenalty);
      this.showTimeDelta(-this.config.timePenalty);
      this.effects.flash('#ff4433', 0.2);
      this.audio.play('wrong');
      this.streak = 0;
      this.penalizeBonusRing();
      const next = this.getRandomSymbolType(this.centerSymbol, ringSymbol.type);
      this.anim.clear();
      this.animateCenterSwap(next, {
        exitDuration: 0.22,
        appearDuration: 0.34,
        offsetRatio: 0.06,
        disappearScale: this.centerBaseScale * 0.5
      });
      this.handlePostAnswerLayoutChange(next);
    } finally {
      this.resolvingAnswer = false;
    }
  }

  private triggerScoreParticles(ringSymbol: Symbol) {
    if (!this.particlesEnabled || this.particleDensity <= 0) return;

    const palette = getSymbolPalette(ringSymbol);
    const center = this.getCanvasCenter();
    const ringRadius = this.getRingRadius();
    const intensity = 1 + Math.min(this.streak, 20) * 0.08;
    const count = Math.max(0, Math.round(this.particleDensity * intensity));
    if (count <= 0) return;

    const brighten = Math.min(0.45, (this.streak - 1) * 0.025);
    const color = colorWithAlpha(palette.glow, 0.85, brighten);
    const chargeTotal = this.computeParticleCharge(count, intensity);
    this.particles.spawnBurst({
      center,
      origin: { x: ringSymbol.x, y: ringSymbol.y },
      ringRadius,
      color,
      count,
      intensity,
      chargeTotal,
      chargeColor: palette.glow
    });
  }

  private computeParticleCharge(count: number, intensity: number) {
    if (count <= 0) return 0;
    const normalized = (count * Math.max(1, intensity)) / 150;
    const streakBonus = Math.min(this.streak, 50) * 0.002;
    return clamp(normalized + streakBonus, 0.015, 0.55);
  }

  private penalizeBonusRing() {
    const penalty = this.getBonusPenaltyAmount();

    if (this.bonusRingState === 'active') {
      this.endBonusRing();
      return;
    }

    if (!Number.isFinite(penalty)) {
      this.bonusChargePoints = 0;
    } else {
      this.bonusChargePoints = Math.max(0, this.bonusChargePoints - penalty);
    }
    this.syncBonusChargeTarget();

    if (this.bonusChargePoints <= 0 && this.bonusRingState !== 'cooldown') {
      this.resetBonusRingColor();
      this.bonusRingState = 'idle';
    }
  }

  private handleParticleAbsorb(event: ParticleAbsorbEvent) {
    if (this.gamePhase !== 'playing') return;
    const amount = clamp(event.energy, 0, 1);
    if (amount <= 0) return;
    const rgb = hexToRgb(event.color);
    if (rgb) {
      this.mixBonusRingColor(rgb, amount);
    }
  }

  private mixBonusRingColor(color: RGBColor, weight: number) {
    const w = Math.max(0, weight);
    if (w <= 0) return;
    const totalWeight = this.bonusRingColorWeight + w;
    const safeTotal = Math.max(0.0001, totalWeight);
    this.bonusRingColor = {
      r: Math.round((this.bonusRingColor.r * this.bonusRingColorWeight + color.r * w) / safeTotal),
      g: Math.round((this.bonusRingColor.g * this.bonusRingColorWeight + color.g * w) / safeTotal),
      b: Math.round((this.bonusRingColor.b * this.bonusRingColorWeight + color.b * w) / safeTotal)
    };
    this.bonusRingColorWeight = Math.min(10, safeTotal);
  }

  private resetBonusRingColor() {
    this.bonusRingColor = cloneColor(DEFAULT_SYMBOL_COLORS[0]);
    this.bonusRingColorWeight = 0;
  }

  private resetBonusRing() {
    this.bonusRingState = 'idle';
    this.bonusRingCharge = 0;
    this.bonusRingChargeTarget = 0;
    this.bonusRingRotation = 0;
    this.bonusRingActiveTimer = 0;
    this.bonusRingCooldownTimer = 0;
    this.bonusChargePoints = 0;
    this.bonusScoreMultiplier = 1;
    this.resetBonusRingColor();
    this.syncBonusChargeTarget();
  }

  private triggerScoreCelebration(ringSymbol: Symbol) {
    this.scorePulseTimer = SCORE_PULSE_DURATION;
    const target = this.getScoreAnchor();
    const palette = getSymbolPalette(ringSymbol);
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
    const themeOrder = this.getThemeSymbolSet();
    const baseTypes = (themeOrder.length > 0 ? themeOrder : SYMBOL_THEME_SETS.classic).slice(0, positions.length);
    this.symbols = positions.map((pos, index) => {
      const symbol: Symbol = {
        type: baseTypes[index % baseTypes.length] ?? (themeOrder[0] ?? SYMBOL_THEME_SETS.classic[0]),
        x: pos.x,
        y: pos.y,
        scale: this.ringSymbolScale,
        rotation: 0
      };
      this.assignSymbolColor(symbol);
      return symbol;
    });

    this.ringRotationOffset = 0;
    this.spinState = null;
    this.reapplyActiveMechanicLayout();
    this.applyCenterSymbol(this.getRandomSymbolType());
    this.centerScale = this.centerBaseScale;
    this.centerOpacity = 1;
    this.recordPromptSpawn();
    console.log('[debug] initSymbols created', this.symbols.length, 'symbols, currentTargetIndex=', this.currentTargetIndex, 'types=', this.symbols.map(s => s.type));
  }

  private computeIntroRotationTarget(startRotation: number) {
    const normalized = ((startRotation % TAU) + TAU) % TAU;
    const direction = Math.random() < 0.5 ? -1 : 1;
    const extraTurns = Math.floor(randBetween(1, 3)); // 1-2 additional full rotations
    const closingRotation = direction > 0 ? (TAU - normalized) : -normalized;
    return startRotation + closingRotation + direction * extraTurns * TAU;
  }

  private createIntroSymbolState(symbol: Symbol, orderIndex: number, width: number, height: number): IntroSymbolState {
    const overshootBase = Math.max(width, height) * 0.22 + 60;
    const startX = randBetween(width * 0.08, width * 0.92);
    const startY = height + randBetween(overshootBase * 0.45, overshootBase * 1.2);
    const variance = this.attractVisualConfig.sizeVariancePct / 100;
    const scaleFactor = randBetween(0.55, 0.85 + variance * 0.3);
    const startScale = Math.max(this.centerMinScale * 0.35, symbol.scale * scaleFactor);
    const curveRange = Math.max(width * 0.12, 40);
    const curveStrength = randBetween(-curveRange, curveRange);
    const bendTargetX = symbol.x + curveStrength * 0.25;
    const pathDistance = Math.hypot(bendTargetX - startX, symbol.y - startY);
    const speedMultiplier = Math.max(0.35, this.attractVisualConfig.speedMultiplier);
    const travelSpeed = randBetween(height * 0.2, height * 0.32) * speedMultiplier;
    const durationBase = clamp(
      pathDistance / Math.max(80, travelSpeed),
      INTRO_SYMBOL_BASE_DURATION * 0.9,
      INTRO_SYMBOL_BASE_DURATION * 1.9
    );
    const duration = durationBase + orderIndex * 0.05;
    const startRotation = randBetween(0, TAU);
    const rotationTarget = this.computeIntroRotationTarget(startRotation);
    const startKeyframe: IntroKeyframe = {
      x: startX,
      y: startY,
      scale: startScale,
      opacity: 0,
      rotation: startRotation
    };
    const endKeyframe: IntroKeyframe = {
      x: symbol.x,
      y: symbol.y,
      scale: symbol.scale,
      opacity: 1,
      rotation: rotationTarget
    };

    return {
      symbol,
      delay: INTRO_SYMBOL_BASE_DELAY + orderIndex * INTRO_SYMBOL_DELAY_STEP,
      duration,
      start: startKeyframe,
      end: endKeyframe,
      current: { ...startKeyframe },
      progress: 0,
      rotationTarget,
      curveStrength
    };
  }

  private createIntroCenterState(sequenceIndex: number, width: number, height: number, anchor: { x: number; y: number }): IntroCenterState {
    const overshootBase = Math.max(width, height) * 0.25 + 100;
    const startX = randBetween(width * 0.15, width * 0.85);
    const startY = height + randBetween(overshootBase * 0.5, overshootBase * 1.1);
    const scaleFactor = randBetween(0.6, 0.85);
    const startScale = Math.max(this.centerMinScale * 0.5, this.centerScale * scaleFactor);
    const curveRange = Math.max(width * 0.08, height * 0.04);
    const curveStrength = randBetween(-curveRange, curveRange);
    const bendTargetX = anchor.x + curveStrength * 0.25;
    const pathDistance = Math.hypot(bendTargetX - startX, anchor.y - startY);
    const speedMultiplier = Math.max(0.35, this.attractVisualConfig.speedMultiplier);
    const travelSpeed = randBetween(height * 0.23, height * 0.34) * speedMultiplier;
    const duration = clamp(
      pathDistance / Math.max(80, travelSpeed),
      INTRO_CENTER_DURATION * 0.85,
      INTRO_CENTER_DURATION * 1.4
    );
    const startRotation = randBetween(0, TAU);
    const rotationTarget = this.computeIntroRotationTarget(startRotation);
    const delay = INTRO_SYMBOL_BASE_DELAY + sequenceIndex * INTRO_SYMBOL_DELAY_STEP + INTRO_CENTER_DELAY_EXTRA;
    const startKeyframe: IntroKeyframe = {
      x: startX,
      y: startY,
      scale: startScale,
      opacity: 0,
      rotation: startRotation
    };
    const endKeyframe: IntroKeyframe = {
      x: anchor.x,
      y: anchor.y,
      scale: this.centerScale,
      opacity: 1,
      rotation: rotationTarget
    };

    return {
      delay,
      duration,
      start: startKeyframe,
      end: endKeyframe,
      current: { ...startKeyframe },
      progress: 0,
      rotationTarget,
      curveStrength
    };
  }

  private beginIntroTransition() {
    const r = this.renderer;
    const canvasRef = this.renderer.canvas;
    const width = Math.max(1, r.w || canvasRef.width);
    const height = Math.max(1, r.h || canvasRef.height);
    const order = this.getIntroSymbolOrder();
    const symbolStates = order
      .map((symbolIndex, orderIndex) => {
        const symbol = this.symbols[symbolIndex];
        return symbol ? this.createIntroSymbolState(symbol, orderIndex, width, height) : null;
      })
      .filter((state): state is IntroSymbolState => Boolean(state));
    const symbolLookup = new Map<Symbol, IntroSymbolState>();
    symbolStates.forEach((state) => symbolLookup.set(state.symbol, state));
    const anchor = this.getCanvasCenter();
    this.centerPos.x = anchor.x;
    this.centerPos.y = anchor.y;
    const centerState = this.createIntroCenterState(symbolStates.length, width, height, anchor);

    this.introTransition = {
      timer: 0,
      hudAlpha: 0,
      hudDelay: centerState.delay + centerState.duration + INTRO_HUD_DELAY_OFFSET,
      hudFade: INTRO_HUD_FADE_DURATION,
      symbolStates,
      symbolLookup,
      center: centerState
    };
  }

  private updateIntroTransition(dt: number): boolean {
    const state = this.introTransition;
    if (!state) {
      return false;
    }
    state.timer += dt;
    let anyActive = false;
    state.symbolStates.forEach((entry) => {
      entry.end.x = entry.symbol.x;
      entry.end.y = entry.symbol.y;
      entry.end.scale = entry.symbol.scale;
      entry.end.rotation = entry.rotationTarget;
      const elapsed = Math.max(0, state.timer - entry.delay);
      const progress = entry.duration <= 0 ? 1 : Math.min(1, elapsed / entry.duration);
      entry.progress = progress;
      const eased = easeOutCubicTransition(progress);
      const horizontalCurve = entry.curveStrength !== 0 ? Math.sin(Math.PI * Math.min(1, eased)) * entry.curveStrength : 0;
      entry.current.x = lerp(entry.start.x, entry.end.x, eased) + horizontalCurve;
      entry.current.y = lerp(entry.start.y, entry.end.y, eased);
      entry.current.scale = lerp(entry.start.scale, entry.end.scale, eased);
      entry.current.opacity = lerp(entry.start.opacity, entry.end.opacity, eased);
      entry.current.rotation = lerp(entry.start.rotation, entry.end.rotation, eased);
      if (progress < 1) {
        anyActive = true;
      }
    });

    const center = state.center;
    const targetCenterX = this.centerPos.x || this.renderer.w / 2;
    const targetCenterY = this.centerPos.y || this.renderer.h / 2;
    center.end.x = targetCenterX;
    center.end.y = targetCenterY;
    center.end.scale = this.centerScale;
    center.end.rotation = center.rotationTarget;
    const centerElapsed = Math.max(0, state.timer - center.delay);
    const centerProgress = center.duration <= 0 ? 1 : Math.min(1, centerElapsed / center.duration);
    center.progress = centerProgress;
    const centerEased = easeOutCubicTransition(centerProgress);
    const centerCurve = center.curveStrength !== 0 ? Math.sin(Math.PI * Math.min(1, centerEased)) * center.curveStrength : 0;
    center.current.x = lerp(center.start.x, center.end.x, centerEased) + centerCurve;
    center.current.y = lerp(center.start.y, center.end.y, centerEased);
    center.current.scale = lerp(center.start.scale, center.end.scale, centerEased);
    center.current.opacity = lerp(center.start.opacity, center.end.opacity, centerEased);
    center.current.rotation = lerp(center.start.rotation, center.end.rotation, centerEased);
    if (centerProgress < 1) {
      anyActive = true;
    }

    if (state.timer >= state.hudDelay) {
      const hudProgress = Math.min(
        1,
        Math.max(0, (state.timer - state.hudDelay) / Math.max(0.001, state.hudFade))
      );
      state.hudAlpha = hudProgress;
    } else {
      state.hudAlpha = 0;
    }

    if (anyActive || state.hudAlpha < 1) {
      return true;
    }

    this.introTransition = null;
    return false;
  }

  private getIntroSymbolOrder() {
    return [0, 1, 2, 3];
  }

  private updateAttractState(dt: number) {
    const width = this.renderer.w || this.renderer.canvas.width;
    const height = this.renderer.h || this.renderer.canvas.height;
    if (!width || !height) {
      return;
    }
    this.attractPulseTime += dt;
    const spawnAllowed = this.gamePhase === 'attract' && !this.attractStartRequested;
    this.updateAttractSymbols(dt, width, height);
    if (spawnAllowed) {
      this.ensureAttractSymbolQuota(width, height);
    }
    if (this.attractStartRequested) {
      this.attractPromptAlpha = Math.max(0, this.attractPromptAlpha - dt * 2.5);
    } else {
      this.attractPromptAlpha = Math.min(1, this.attractPromptAlpha + dt * 1.2);
    }
  }

  private updateAttractSymbols(dt: number, width: number, height: number) {
    const fallbackMargin = Math.max(width, height) * 0.35 + 80;
    this.attractSymbols = this.attractSymbols
      .map((entry) => {
        const nextAge = entry.age + dt;
        const activeAge = Math.max(0, nextAge - entry.spawnDelay);
        const isActive = nextAge >= entry.spawnDelay;
        const progress = Math.min(1, entry.life > 0 ? activeAge / entry.life : 1);
        const symbol = entry.symbol;
        if (isActive) {
          symbol.x += entry.vx * dt;
          symbol.y += entry.vy * dt;
          symbol.rotation += entry.rotationSpeed * dt;
        }
        symbol.scale = lerp(entry.startScale, entry.endScale, progress);
        return {
          ...entry,
          age: nextAge,
          symbol
        };
      })
      .filter((entry) => {
        const margin = entry.exitMargin ?? fallbackMargin;
        const buffer = entry.symbol.scale * 50;
        const isActive = entry.age >= entry.spawnDelay;
        const fullyAbove = isActive && entry.symbol.y + buffer < -margin;
        const offLeft = entry.symbol.x + buffer < -margin;
        const offRight = entry.symbol.x - buffer > width + margin;
        const expired = isActive && (entry.age - entry.spawnDelay) > entry.life + 1.5;
        return !(expired || fullyAbove || offLeft || offRight);
      });
  }

  private ensureAttractSymbolQuota(width: number, height: number) {
    const desired = clamp(Math.round(this.attractVisualConfig.count), MENU_MIN_SYMBOLS, MENU_MAX_SYMBOLS);
    while (this.attractSymbols.length < desired) {
      this.attractSymbols.push(this.createAttractSymbol(width, height));
    }
    if (this.attractSymbols.length > desired) {
      this.attractSymbols.splice(0, this.attractSymbols.length - desired);
    }
  }

  private pickMenuSymbolColor(): RGBColor {
    const pool = this.menuColorPool.length > 0 ? this.menuColorPool : DEFAULT_SYMBOL_COLORS;
    const idx = Math.floor(Math.random() * pool.length);
    const color = pool[idx] ?? DEFAULT_SYMBOL_COLORS[0];
    return cloneColor(color);
  }

  private createAttractSymbol(width: number, height: number): AttractSymbolState {
    const themeSet = SYMBOL_THEME_SETS[this.attractVisualConfig.symbolTheme] ?? SYMBOL_THEME_SETS.classic;
    const symbolType = themeSet[Math.floor(Math.random() * themeSet.length)] as SymbolType;
    const overshoot = Math.max(width, height) * 0.08 + 32;
    const exitMargin = Math.max(width, height) * 0.4 + 120;
    const startX = randBetween(width * 0.05, width * 0.95);
    const startY = height + randBetween(overshoot, overshoot * 2.2);
    const speedMultiplier = this.attractVisualConfig.speedMultiplier;
    const verticalSpeed = randBetween(height * 0.18, height * 0.28) * speedMultiplier;
    const horizontalDrift = randBetween(-width * 0.12, width * 0.12) * speedMultiplier;

    const baseSizeVW = this.attractVisualConfig.baseSizeVW;
    const baseSizePx = Math.max(4, width * (baseSizeVW / 100));
    const variance = this.attractVisualConfig.sizeVariancePct / 100;
    const jitter = variance > 0 ? randBetween(-variance, variance) : 0;
    const startSizePx = Math.max(6, baseSizePx * (1 + jitter));
    const startScale = Math.max(0.05, startSizePx / MENU_SYMBOL_BASE_SIZE);

    const minGrowth = 1.05;
    const growthMax = Math.max(minGrowth, this.attractVisualConfig.growthMultiplier);
    const growthMultiplier = growthMax === minGrowth ? minGrowth : randBetween(minGrowth, growthMax);
    const endScale = Math.max(startScale * growthMultiplier, startScale + 0.05);

    const travelDistance = startY + exitMargin + endScale * 50;
    const life = Math.max(2.5, travelDistance / verticalSpeed);
    const rotationSpeed = randBetween(-2.2, 2.2) * speedMultiplier;
    const spawnDelayRange = Math.min(8, 0.3 * this.attractVisualConfig.count);
    const spawnDelay = randBetween(0, spawnDelayRange / Math.max(0.3, speedMultiplier));

    const symbol: Symbol = {
      type: symbolType,
      x: startX,
      y: startY,
      scale: startScale,
      rotation: randBetween(0, Math.PI * 2),
      color: this.pickMenuSymbolColor()
    };

    return {
      symbol,
      vx: horizontalDrift,
      vy: -verticalSpeed,
      rotationSpeed,
      startScale,
      endScale,
      life,
      age: 0,
      exitMargin,
      spawnDelay
    };
  }

  private drawVaultBackdrop(ctx: CanvasRenderingContext2D, width: number, height: number, overlayOpacity = 0.85) {
    ctx.save();
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#03060f';
    ctx.fillRect(0, 0, width, height);

    const image = this.vaultBackdropImage;
    if (image && (this.vaultBackdropReady || image.complete)) {
      const naturalWidth = image.naturalWidth || image.width || 1080;
      const naturalHeight = image.naturalHeight || image.height || 1920;
      const scale = Math.max(width / naturalWidth, height / naturalHeight);
      const drawWidth = naturalWidth * scale;
      const drawHeight = naturalHeight * scale;
      const offsetX = (width - drawWidth) / 2;
      const offsetY = (height - drawHeight) / 2;
      ctx.globalAlpha = 0.95;
      ctx.drawImage(image, offsetX, offsetY, drawWidth, drawHeight);
    }

    ctx.globalAlpha = 1;
    const overlay = ctx.createLinearGradient(0, 0, 0, height);
    overlay.addColorStop(0, `rgba(4, 10, 19, ${Math.min(1, overlayOpacity)})`);
    overlay.addColorStop(0.65, `rgba(1, 3, 8, ${Math.min(1, overlayOpacity + 0.06)})`);
    overlay.addColorStop(1, `rgba(0, 0, 0, ${Math.min(1, overlayOpacity + 0.12)})`);
    ctx.fillStyle = overlay;
    ctx.fillRect(0, 0, width, height);

    const vignetteRadius = Math.max(width, height) * 0.8;
    const vignette = ctx.createRadialGradient(
      width / 2,
      height / 2,
      vignetteRadius * 0.2,
      width / 2,
      height / 2,
      vignetteRadius
    );
    vignette.addColorStop(0, 'rgba(15, 56, 96, 0.28)');
    vignette.addColorStop(0.55, 'rgba(2, 8, 18, 0.65)');
    vignette.addColorStop(1, 'rgba(0, 0, 0, 0.92)');
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, width, height);

    const scanlineSpacing = Math.max(6, height / 140);
    ctx.globalAlpha = 0.08;
    ctx.fillStyle = '#0b1423';
    for (let y = 0; y < height; y += scanlineSpacing) {
      ctx.fillRect(0, Math.round(y), width, 1);
    }

    ctx.globalAlpha = 0.14;
    const beamWidth = Math.max(8, width * 0.015);
    const leftBeam = ctx.createLinearGradient(0, 0, beamWidth, 0);
    leftBeam.addColorStop(0, 'rgba(34, 135, 255, 0.18)');
    leftBeam.addColorStop(1, 'rgba(34, 135, 255, 0)');
    ctx.fillStyle = leftBeam;
    ctx.fillRect(0, 0, beamWidth, height);
    const rightBeam = ctx.createLinearGradient(width - beamWidth, 0, width, 0);
    rightBeam.addColorStop(0, 'rgba(34, 135, 255, 0)');
    rightBeam.addColorStop(1, 'rgba(34, 135, 255, 0.18)');
    ctx.fillStyle = rightBeam;
    ctx.fillRect(width - beamWidth, 0, beamWidth, height);
    ctx.restore();
  }

  private drawAttractBackground(ctx: CanvasRenderingContext2D, width: number, height: number) {
    this.drawVaultBackdrop(ctx, width, height, 0.78);
  }

  private drawAmbientSymbols(ctx: CanvasRenderingContext2D) {
    if (this.attractSymbols.length === 0) {
      return;
    }
    ctx.save();
    this.attractSymbols.forEach((entry) => {
      if (entry.age < entry.spawnDelay) return;
      drawSymbol(ctx, entry.symbol, false, 0.7);
    });
    ctx.restore();
  }

  private drawAttractPrompt(ctx: CanvasRenderingContext2D, width: number, height: number) {
    if (this.attractPromptAlpha <= 0) {
      this.attractStartRect = null;
      return;
    }
    const titleText = 'REMAP';
    const titleSize = Math.max(48, Math.round(height * 0.14));
    const titleX = width / 2;
    const titleY = Math.round(height * 0.28);

    ctx.save();
    ctx.globalAlpha = this.attractPromptAlpha;
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
    const pulse = (Math.sin(this.attractPulseTime * 2.2) + 1) / 2;
    const labelAlpha = 0.5 + pulse * 0.5;

    ctx.save();
    ctx.globalAlpha = this.attractPromptAlpha;
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
    this.attractStartRect = {
      x: rectX,
      y: rectY,
      width: rectWidth,
      height: rectHeight
    };
    ctx.strokeStyle = `rgba(126, 231, 135, ${0.25 + pulse * 0.5})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(rectX, rectY + rectHeight);
    ctx.lineTo(rectX + rectWidth, rectY + rectHeight);
    ctx.stroke();
    ctx.restore();
  }

  start() {
    if (this.configStore) {
      this.refreshSettings();
    }
    this.introTransition = null;
    this.input.addHandler(this);
    this.clock.stop();
    this.gamePhase = 'playing';
    this.isGameOver = false;
    this.pendingPlacement = null;
    this.finalPlacement = null;
    this.finalName = null;
    this.finalScore = 0;
    this.nameEntrySlots = Array(NAME_SLOT_COUNT).fill(' ');
    this.nameEntryCharIndices = Array(NAME_SLOT_COUNT).fill(0);
    this.nameEntryCursor = 0;
    this.nameInputBuffer = '';
    this.nameKeyboardRow = 0;
    this.nameKeyboardCol = 0;
    this.clearProgressiveLevelAnnouncement();
    this.score = 0;
    this.streak = 0;
    this.timeDeltaValue = 0;
    this.timeDeltaTimer = 0;
    this.correctAnswers = 0;
    this.progressiveMechanicLimit = 0;
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
    this.resetBonusRing();
    this.syncHighscore();
    this.timer.set(this.config.duration);
    this.initSymbols();
    this.beginIntroTransition();
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
    this.updateAttractState(dt);

    if (this.gamePhase === 'attract') {
      this.drawAttractScene();
      return;
    }

    if (this.introTransition) {
      const introActive = this.updateIntroTransition(dt);
      if (introActive) {
        this.draw();
        return;
      }
    }

    if (this.mechanicLevelUpNotice) {
      if (this.mechanicLevelUpTimer > 0) {
        this.mechanicLevelUpTimer = Math.max(0, this.mechanicLevelUpTimer - dt);
      }
      if (this.mechanicLevelUpTimer <= 0) {
        this.clearProgressiveLevelAnnouncement();
      }
      this.draw();
      return;
    }

    if (this.isGameOver || this.gamePhase !== 'playing') {
      this.draw();
      return;
    }

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

    this.updateBonusRing(dt);
    this.updateSpinAnimation(dt);

    const timeLeftFloat = this.timer.get();
    if (timeLeftFloat <= 0) {
      this.beginGameOver();
      this.draw();
      return;
    }

    this.anim.tick(dt);
    this.draw();
  }

  private beginGameOver() {
    if (this.isGameOver) return;
    this.isGameOver = true;
    this.clearProgressiveLevelAnnouncement();
    this.anim.clear();
    this.scoreTracers = [];
    this.particles.clear();
    this.timer.set(0);
    this.timeDeltaTimer = 0;
    this.timeDeltaValue = 0;
    this.finalScore = Math.max(0, Math.round(this.score));
    this.finalPlacement = null;
    this.finalName = null;
    this.pendingPlacement = null;
    this.audio.play('gameover');
    this.mechanicBannerText = null;
    this.resetBonusRing();

    const placement = this.highscoreStore
      ? this.highscoreStore.placementForScore(this.finalScore)
      : Number.POSITIVE_INFINITY;
    if (placement < LEADERBOARD_MAX_ENTRIES) {
      this.prepareNameEntry(placement);
    } else {
      this.syncHighscore();
      this.finalizeGameOver(false);
    }
  }

  private prepareNameEntry(placement: number) {
    this.gamePhase = 'name-entry';
    this.pendingPlacement = placement;
    this.syncHighscore();
    this.nameEntryCursor = 0;
    this.nameEntryCharIndices = Array(NAME_SLOT_COUNT).fill(0);
    this.nameInputBuffer = '';
    this.nameKeyboardRow = 0;
    this.nameKeyboardCol = 0;
    if (this.nameEntryMode === 'keyboard') {
      this.updateSlotsFromBuffer('');
    } else {
      this.nameEntrySlots = Array(NAME_SLOT_COUNT).fill(' ');
    }
  }

  private commitLeaderboardEntry(name: string) {
    const sanitized = this.sanitizePlayerName(name);
    const placement = this.recordScore({ name: sanitized, score: this.finalScore });
    this.finalPlacement = Number.isFinite(placement) ? placement : null;
    this.finalName = sanitized;
    this.syncHighscore();
    this.finalizeGameOver(true);
  }

  private finalizeGameOver(didQualify: boolean) {
    this.pendingPlacement = null;
    this.nameInputBuffer = '';
    this.nameEntrySlots = Array(NAME_SLOT_COUNT).fill(' ');
    this.nameEntryCharIndices = Array(NAME_SLOT_COUNT).fill(0);
    this.nameEntryCursor = 0;
    this.nameKeyboardRow = 0;
    this.nameKeyboardCol = 0;
    this.gamePhase = 'completed';
    this.input.removeHandler(this);
    this.clock.stop();
    const summary: GameCompletionSummary = {
      leaderboard: this.getLeaderboardSnapshot(),
      finalScore: this.finalScore,
      placement:
        this.finalPlacement != null && this.finalPlacement < LEADERBOARD_MAX_ENTRIES
          ? this.finalPlacement
          : null,
      didQualify,
      playerName: this.finalName
    };
    this.emitGameComplete(summary);
  }

  private handleSlotNameEntryInput(event: KeyboardEvent) {
    const key = event.key;
    if (key === 'ArrowRight') {
      this.nameEntryCursor = (this.nameEntryCursor + 1) % NAME_SLOT_COUNT;
      event.preventDefault();
      return;
    }
    if (key === 'ArrowLeft') {
      this.nameEntryCursor = (this.nameEntryCursor - 1 + NAME_SLOT_COUNT) % NAME_SLOT_COUNT;
      event.preventDefault();
      return;
    }
    if (key === 'ArrowUp' || key === 'ArrowDown') {
      const delta = key === 'ArrowUp' ? 1 : -1;
      const current = this.nameEntryCharIndices[this.nameEntryCursor] ?? 0;
      const next = (current + delta + NAME_ALPHABET.length) % NAME_ALPHABET.length;
      this.nameEntryCharIndices[this.nameEntryCursor] = next;
      this.nameEntrySlots[this.nameEntryCursor] = NAME_ALPHABET[next];
      this.nameInputBuffer = this.nameEntrySlots.join('').trimEnd();
      event.preventDefault();
      return;
    }
    if (key === 'Enter') {
      event.preventDefault();
      this.commitLeaderboardEntry(this.nameEntrySlots.join(''));
    }
  }

  private handleKeyboardNameEntryInput(event: KeyboardEvent) {
    const key = event.key;
    if (key === 'ArrowRight') {
      const row = NAME_KEYBOARD_ROWS[this.nameKeyboardRow] ?? [];
      if (row.length > 0) {
        this.nameKeyboardCol = (this.nameKeyboardCol + 1) % row.length;
      }
      event.preventDefault();
      return;
    }
    if (key === 'ArrowLeft') {
      const row = NAME_KEYBOARD_ROWS[this.nameKeyboardRow] ?? [];
      if (row.length > 0) {
        this.nameKeyboardCol = (this.nameKeyboardCol - 1 + row.length) % row.length;
      }
      event.preventDefault();
      return;
    }
    if (key === 'ArrowDown') {
      const nextRow = (this.nameKeyboardRow + 1) % NAME_KEYBOARD_ROWS.length;
      const nextRowKeys = NAME_KEYBOARD_ROWS[nextRow] ?? [];
      this.nameKeyboardRow = nextRow;
      this.nameKeyboardCol = Math.min(this.nameKeyboardCol, Math.max(0, nextRowKeys.length - 1));
      event.preventDefault();
      return;
    }
    if (key === 'ArrowUp') {
      const nextRow =
        (this.nameKeyboardRow - 1 + NAME_KEYBOARD_ROWS.length) % NAME_KEYBOARD_ROWS.length;
      const nextRowKeys = NAME_KEYBOARD_ROWS[nextRow] ?? [];
      this.nameKeyboardRow = nextRow;
      this.nameKeyboardCol = Math.min(this.nameKeyboardCol, Math.max(0, nextRowKeys.length - 1));
      event.preventDefault();
      return;
    }
    if (key === 'Enter') {
      event.preventDefault();
      this.activateKeyboardSelection();
    }
  }

  private activateKeyboardSelection() {
    const row = NAME_KEYBOARD_ROWS[this.nameKeyboardRow] ?? NAME_KEYBOARD_ROWS[0];
    if (!row || row.length === 0) {
      return;
    }
    const key = row[Math.min(this.nameKeyboardCol, row.length - 1)];
    if (!key) {
      return;
    }
    if (key === NAME_KEYBOARD_SPECIAL.BACK) {
      if (this.nameInputBuffer.length > 0) {
        this.nameInputBuffer = this.nameInputBuffer.slice(0, -1);
        this.updateSlotsFromBuffer(this.nameInputBuffer);
      }
      return;
    }
    if (key === NAME_KEYBOARD_SPECIAL.SPACE) {
      if (this.nameInputBuffer.length < NAME_SLOT_COUNT) {
        this.nameInputBuffer += ' ';
        this.updateSlotsFromBuffer(this.nameInputBuffer);
      }
      return;
    }
    if (key === NAME_KEYBOARD_SPECIAL.OK) {
      const submission =
        this.nameInputBuffer.trim().length > 0 ? this.nameInputBuffer : 'PLAYER';
      this.commitLeaderboardEntry(submission);
      return;
    }
    if (key.length === 1 && this.nameInputBuffer.length < NAME_SLOT_COUNT) {
      this.nameInputBuffer += key;
      this.updateSlotsFromBuffer(this.nameInputBuffer);
    }
  }

  private drawAttractScene() {
    const r = this.renderer;
    const ctx = r.ctx;
    const width = r.w || this.renderer.canvas.width;
    const height = r.h || this.renderer.canvas.height;
    this.drawAttractBackground(ctx, width, height);
    this.drawAmbientSymbols(ctx);
    this.drawAttractPrompt(ctx, width, height);
  }

  private draw() {
    const r = this.renderer;
    const ctx = r.ctx;
    const intro = this.introTransition;
    if (this.gamePhase === 'attract') {
      this.drawAttractScene();
      return;
    }
    this.drawVaultBackdrop(ctx, r.w, r.h, 0.85);
    const anchor = this.getCanvasCenter();
    if (anchor.x !== this.lastRingCenter.x || anchor.y !== this.lastRingCenter.y) {
      this.updateRingLayout();
    }
    if (!this.anim.isActive()) {
      this.centerPos.x = anchor.x;
      this.centerPos.y = anchor.y;
    }
    this.drawRingBackdrop(ctx);
    this.drawAmbientSymbols(ctx);
    this.drawBonusRing(ctx);

    const hideRing = this.activeMechanics.includes('memory') && this.memorySymbolsHidden;
    const spinState = this.spinState && this.spinState.active ? this.spinState : null;
    const velocity = spinState ? Math.abs(spinState.velocity) : 0;
    const blurAmount = spinState ? clamp(velocity * 0.1, 0, 5.5) : 0;
    const applyBlur = !hideRing && blurAmount > 0.15;

    // Draw symbols
    if (applyBlur) {
      ctx.save();
      ctx.filter = `blur(${blurAmount.toFixed(2)}px)`;
    }
    const introSymbolLookup = intro?.symbolLookup ?? null;
    this.symbols.forEach((symbol) => {
      if (hideRing) {
        return;
      }
      const introEntry = introSymbolLookup?.get(symbol) ?? null;
      if (introEntry) {
        if (introEntry.current.opacity <= 0) {
          return;
        }
        ctx.save();
        ctx.globalAlpha *= introEntry.current.opacity;
        const animatedSymbol: Symbol = {
          ...symbol,
          x: introEntry.current.x,
          y: introEntry.current.y,
          scale: introEntry.current.scale,
          rotation: introEntry.current.rotation ?? symbol.rotation
        };
        drawSymbol(ctx, animatedSymbol, false, this.symbolStrokeScale);
        ctx.restore();
        return;
      }
      // ring answers are not the current prompt; draw with normal glow
      drawSymbol(ctx, symbol, false, this.symbolStrokeScale);
    });
    if (applyBlur) {
      ctx.restore();
    }

    if (this.particlesEnabled) {
      this.particles.draw(ctx);
    }

    // Draw center prompt symbol larger in the middle (may be animating)
    let centerX = this.centerPos.x || r.w / 2;
    let centerY = this.centerPos.y || r.h / 2;
    let centerScale = this.centerScale;
    let centerOpacity = this.centerOpacity;
    let centerRotation = 0;
    if (intro) {
      centerX = intro.center.current.x;
      centerY = intro.center.current.y;
      centerScale = intro.center.current.scale;
      centerOpacity *= intro.center.current.opacity;
      centerRotation = intro.center.current.rotation ?? 0;
    }
    const centerSym: Symbol = {
      type: this.centerSymbol,
      x: centerX,
      y: centerY,
      scale: centerScale,
      rotation: centerRotation,
      color: this.centerSymbolColor
    };
    ctx.save();
    ctx.globalAlpha = centerOpacity;
    drawSymbol(ctx, centerSym, true, this.symbolStrokeScale);
    ctx.restore();

    const hudOpacity = intro ? intro.hudAlpha : 1;
    const hudMetrics = this.drawScoreboard(ctx, hudOpacity);
    const hudVisible = hudOpacity > 0.001;
    if (hudVisible) {
      this.drawBonusPrompt(ctx, hudMetrics, hudOpacity);
    }
    if (!this.mechanicLevelUpNotice && this.gamePhase === 'playing' && hudVisible) {
      this.drawMechanicBanner(ctx, hudMetrics);
    }
    if (hudVisible) {
      this.drawTimeBar(ctx, hudOpacity);
    }
    if (this.gamePhase === 'name-entry') {
      this.drawNameEntryPanel(ctx);
    }
    if (this.mechanicLevelUpNotice) {
      this.drawMechanicLevelAnnouncement(ctx);
    }

    this.lastRingCenter = anchor;
  }

  private drawScoreboard(ctx: CanvasRenderingContext2D, opacity = 1): HudMetrics {
    const r = this.renderer;
    const hudPad = Math.round(Math.max(10, r.h * 0.02));
    const scoreFontSize = Math.max(28, Math.round(r.h * 0.075));
    const stripTop = Math.round(hudPad * 0.4);
    const stripHeight = Math.max(scoreFontSize * 1.5, Math.round(r.h * 0.12));
    const labelFontSize = Math.max(12, Math.round(scoreFontSize * 0.3));
    const valueFontSize = Math.max(16, Math.round(scoreFontSize * 0.46));
    const labelOffset = Math.max(3, Math.round(r.h * 0.005));
    const scoreBlockHeight = stripHeight - labelFontSize - labelOffset;
    const topY = stripTop + Math.round((stripHeight - scoreFontSize) / 2);
    const scoreStripBottom = stripTop + stripHeight;
    const stripLeft = hudPad;
    const stripRight = r.w - hudPad;
    const stripWidth = stripRight - stripLeft;
    const dividerGlowWidth = Math.max(2, Math.round(stripWidth * 0.003));

    const centerWidth = Math.max(stripWidth * 0.34, 280);
    const sideWidth = Math.max((stripWidth - centerWidth) / 2, 140);
    const adjustedCenterWidth = stripWidth - sideWidth * 2;

    const metrics: HudMetrics = {
      hudPad,
      topY,
      scoreFontSize,
      labelFontSize,
      valueFontSize,
      labelOffset,
      scoreBlockHeight,
      scoreStripBottom,
      stripLeft,
      stripRight,
      stripHeight,
      streakBadge: {
        x: stripLeft,
        y: stripTop,
        width: sideWidth,
        height: stripHeight
      },
      bestBadge: {
        x: stripRight - sideWidth,
        y: stripTop,
        width: sideWidth,
        height: stripHeight
      },
      scoreArea: {
        x: stripLeft + sideWidth,
        width: adjustedCenterWidth,
        centerX: stripLeft + sideWidth + adjustedCenterWidth / 2,
        centerY: stripTop + stripHeight / 2
      }
    };

    const clampedOpacity = clamp(opacity, 0, 1);
    if (clampedOpacity <= 0) {
      return metrics;
    }

    const gradient = ctx.createLinearGradient(stripLeft, stripTop, stripRight, stripTop);
    gradient.addColorStop(0, 'rgba(8, 12, 20, 0.85)');
    gradient.addColorStop(0.5, 'rgba(5, 9, 16, 0.95)');
    gradient.addColorStop(1, 'rgba(8, 12, 20, 0.85)');

    const drawRoundRect = (x: number, y: number, w: number, h: number, radius: number) => {
      const rads = Math.min(radius, Math.min(w, h) / 2);
      ctx.beginPath();
      ctx.moveTo(x + rads, y);
      ctx.lineTo(x + w - rads, y);
      ctx.quadraticCurveTo(x + w, y, x + w, y + rads);
      ctx.lineTo(x + w, y + h - rads);
      ctx.quadraticCurveTo(x + w, y + h, x + w - rads, y + h);
      ctx.lineTo(x + rads, y + h);
      ctx.quadraticCurveTo(x, y + h, x, y + h - rads);
      ctx.lineTo(x, y + rads);
      ctx.quadraticCurveTo(x, y, x + rads, y);
      ctx.closePath();
    };

    ctx.save();
    ctx.globalAlpha *= clampedOpacity;
    drawRoundRect(stripLeft, stripTop, stripWidth, stripHeight, stripHeight / 2.4);
    ctx.fillStyle = gradient;
    ctx.fill();

    const dividerXLeft = stripLeft + sideWidth;
    const dividerXRight = stripRight - sideWidth;
    const dividerGradientLeft = ctx.createLinearGradient(dividerXLeft - dividerGlowWidth, 0, dividerXLeft + dividerGlowWidth, 0);
    dividerGradientLeft.addColorStop(0, 'rgba(0,0,0,0)');
    dividerGradientLeft.addColorStop(0.5, 'rgba(120, 192, 255, 0.35)');
    dividerGradientLeft.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = dividerGradientLeft;
    ctx.fillRect(dividerXLeft - dividerGlowWidth, stripTop + 4, dividerGlowWidth * 2, stripHeight - 8);
    const dividerGradientRight = ctx.createLinearGradient(dividerXRight - dividerGlowWidth, 0, dividerXRight + dividerGlowWidth, 0);
    dividerGradientRight.addColorStop(0, 'rgba(0,0,0,0)');
    dividerGradientRight.addColorStop(0.5, 'rgba(120, 192, 255, 0.35)');
    dividerGradientRight.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = dividerGradientRight;
    ctx.fillRect(dividerXRight - dividerGlowWidth, stripTop + 4, dividerGlowWidth * 2, stripHeight - 8);
    ctx.restore();

    this.drawScoreTracers(ctx);

    const scorePulseRatio = clamp(this.scorePulseTimer / SCORE_PULSE_DURATION, 0, 1);
    const scoreScale = 1 + SCORE_PULSE_SCALE * easeInCubic(scorePulseRatio);

    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.translate(metrics.scoreArea.centerX, metrics.scoreArea.centerY);
    ctx.scale(scoreScale, scoreScale);
    ctx.translate(-metrics.scoreArea.centerX, -metrics.scoreArea.centerY);
    ctx.font = `${scoreFontSize}px Orbitron, sans-serif`;
    ctx.fillStyle = '#f8fbff';
    ctx.shadowColor = 'rgba(121,192,255,0.45)';
    ctx.shadowBlur = 12;
    ctx.fillText(`${this.score}`, metrics.scoreArea.centerX, metrics.scoreArea.centerY);
    ctx.restore();

    const drawBadge = (
      badge: HudMetrics['streakBadge'],
      label: string,
      value: string,
      baseColor: string,
      glowColor: string,
      align: 'left' | 'right'
    ) => {
      ctx.save();
      const paddingX = Math.max(12, badge.width * 0.14);
      const labelY = badge.y + Math.max(8, badge.height * 0.18);
      ctx.font = `${labelFontSize}px Orbitron, sans-serif`;
      ctx.textBaseline = 'top';
      ctx.textAlign = align;
      ctx.fillStyle = baseColor;
      ctx.shadowColor = glowColor;
      ctx.shadowBlur = 8;
      const textX = align === 'left' ? badge.x + paddingX : badge.x + badge.width - paddingX;
      ctx.fillText(label, textX, labelY);
      ctx.font = `${valueFontSize}px Orbitron, sans-serif`;
      ctx.textBaseline = 'top';
      ctx.fillText(value, textX, labelY + labelFontSize + labelOffset);
      ctx.restore();
    };

    const streakHot = clamp(this.streak / 20, 0, 1);
    const streakColorCold = 'rgba(90, 118, 148, 0.8)';
    const streakColorHot = '#7ee787';
    const streakGlow = streakHot > 0.6 ? '#7ee787' : 'rgba(120,192,255,0.25)';
    const streakColor = streakHot >= 1 ? streakColorHot : `rgba(${Math.round(90 + (126 - 90) * streakHot)}, ${Math.round(118 + (231 - 118) * streakHot)}, ${Math.round(148 + (135 - 148) * streakHot)}, ${0.6 + 0.4 * streakHot})`;

    drawBadge(metrics.streakBadge, 'Streak', `${this.streak}`, streakHot > 0 ? streakColor : streakColorCold, streakGlow, 'left');

    drawBadge(metrics.bestBadge, 'Best', `${this.highscore}`, '#79c0ff', 'rgba(121,192,255,0.5)', 'right');

    return metrics;
  }

  private drawBonusPrompt(ctx: CanvasRenderingContext2D, metrics: HudMetrics, opacity: number) {
    const state = this.bonusRingState;
    if (state === 'idle' || state === 'charging') {
      return;
    }
    const prompt = state === 'ready'
      ? 'Bonus ready - press Enter'
      : `Bonus x${this.bonusScoreMultiplier.toFixed(1)} active`;
    const color = state === 'ready' ? '#e0f2ff' : '#ffd166';
    const alpha = Math.max(0, Math.min(1, opacity));
    ctx.save();
    ctx.globalAlpha *= alpha;
    ctx.font = `${Math.max(12, Math.round(metrics.labelFontSize * 1.1))}px Orbitron, sans-serif`;
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.65)';
    ctx.shadowBlur = 6;
    const y = metrics.scoreStripBottom + Math.max(6, Math.round(metrics.hudPad * 0.25));
    ctx.fillText(prompt, this.renderer.w / 2, y);
    ctx.restore();
  }

  private drawMechanicBanner(ctx: CanvasRenderingContext2D, metrics: HudMetrics) {
    const showRemapMapping = this.activeMechanics.includes('remap') && this.remapMapping;
    const bannerTextRaw = this.mechanicBannerText ? this.mechanicBannerText.trim() : '';
    if (!showRemapMapping && !bannerTextRaw) {
      return;
    }

    const tokens = bannerTextRaw
      ? bannerTextRaw.split('|').map((token) => token.trim()).filter(Boolean)
      : [];
    const bannerText = tokens.length > 0 ? tokens.join(' \u2022 ') : bannerTextRaw;

    const accentMechanic = showRemapMapping
      ? 'remap'
      : this.activeMechanics.length > 0
        ? this.activeMechanics[0]
        : 'none';
    const accentColor = MECHANIC_COLORS[accentMechanic] ?? '#79c0ff';

    const bannerPadding = Math.max(16, metrics.hudPad);
    const bannerHeight = Math.max(40, Math.round(metrics.scoreFontSize * 0.45));
    const bannerTop = metrics.scoreStripBottom + Math.max(8, metrics.hudPad * 0.25);
    const bannerLeft = metrics.stripLeft + bannerPadding * 0.4;
    const bannerRight = metrics.stripRight - bannerPadding * 0.4;
    const bannerWidth = Math.max(120, bannerRight - bannerLeft);
    const cornerRadius = bannerHeight / 2.1;

    const mappingWidth = showRemapMapping ? Math.max(110, bannerHeight * 2.6) : 0;
    const mappingSpacing = showRemapMapping ? Math.max(18, bannerHeight * 0.4) : 0;
    const textPadding = Math.max(16, bannerPadding * 0.8);
    const textAreaWidth = bannerWidth - (showRemapMapping ? mappingWidth + mappingSpacing : 0);
    const availableTextWidth = Math.max(0, textAreaWidth - textPadding * 2);
    const textMessage = !showRemapMapping ? (bannerText || 'Mechanics Ready') : '';

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
    drawRoundedRect(bannerLeft, bannerTop, bannerWidth, bannerHeight, cornerRadius);
    const gradient = ctx.createLinearGradient(bannerLeft, bannerTop, bannerRight, bannerTop);
    gradient.addColorStop(0, 'rgba(7, 10, 18, 0.85)');
    gradient.addColorStop(1, 'rgba(4, 7, 12, 0.92)');
    ctx.fillStyle = gradient;
    ctx.fill();
    ctx.strokeStyle = colorWithAlpha(accentColor, 0.65, 0.2);
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();

    if (textMessage && availableTextWidth > 0) {
      ctx.save();
      ctx.font = `${Math.max(14, Math.round(bannerHeight * 0.48))}px Orbitron, sans-serif`;
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#f5faff';
      ctx.shadowColor = colorWithAlpha(accentColor, 0.35, 0.2);
      ctx.shadowBlur = 8;
      const textX = bannerLeft + textAreaWidth / 2;
      const textY = bannerTop + bannerHeight / 2;
      let displayText = textMessage;
      if (ctx.measureText(displayText).width > availableTextWidth) {
        while (displayText.length > 1 && ctx.measureText(displayText + '\u2026').width > availableTextWidth) {
          displayText = displayText.slice(0, -1);
        }
        displayText = displayText + '\u2026';
      }
      ctx.fillText(displayText, textX, textY);
      ctx.restore();
    }

    if (showRemapMapping && this.remapMapping) {
      const scaleFactor = clamp(this.renderer.h * 0.0009, 0.45, 0.7);
      const symbolSize = 40 * scaleFactor;
      const mappingLeft = bannerRight - mappingWidth + Math.max(10, bannerPadding * 0.4);
      const mappingCenterY = bannerTop + bannerHeight / 2;
      const symbolSpacing = Math.max(12, symbolSize * 0.4);
      const arrowWidth = Math.max(40, symbolSize * 0.9);
      const leftSymbol: Symbol = {
        type: this.remapMapping.from,
        x: mappingLeft + symbolSize / 2,
        y: mappingCenterY,
        scale: scaleFactor,
        rotation: 0,
        color: this.getColorForSymbolType(this.remapMapping.from)
      };
      const rightSymbol: Symbol = {
        type: this.remapMapping.to,
        x: mappingLeft + symbolSize / 2 + arrowWidth + symbolSpacing + symbolSize,
        y: mappingCenterY,
        scale: scaleFactor,
        rotation: 0,
        color: this.getColorForSymbolType(this.remapMapping.to)
      };
      drawSymbol(ctx, leftSymbol, true, this.symbolStrokeScale * 0.9);
      drawSymbol(ctx, rightSymbol, true, this.symbolStrokeScale * 0.9);

      ctx.save();
      const arrowStartX = mappingLeft + symbolSize + symbolSpacing;
      ctx.strokeStyle = colorWithAlpha(accentColor, 0.85, 0.15);
      ctx.lineWidth = Math.max(6, symbolSize * 0.3);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(arrowStartX, mappingCenterY);
      ctx.lineTo(arrowStartX + arrowWidth, mappingCenterY);
      ctx.stroke();
      ctx.lineWidth = Math.max(4, symbolSize * 0.2);
      ctx.beginPath();
      ctx.moveTo(arrowStartX + arrowWidth - symbolSize * 0.45, mappingCenterY - symbolSize * 0.35);
      ctx.lineTo(arrowStartX + arrowWidth, mappingCenterY);
      ctx.lineTo(arrowStartX + arrowWidth - symbolSize * 0.45, mappingCenterY + symbolSize * 0.35);
      ctx.stroke();
      ctx.restore();
    }
  }

  private drawNameEntryPanel(ctx: CanvasRenderingContext2D) {
    void ctx;
  }

  private drawMechanicLevelAnnouncement(ctx: CanvasRenderingContext2D) {
    void ctx;
  }

  private drawTimeBar(ctx: CanvasRenderingContext2D, opacity = 1) {
    const r = this.renderer;
    const pad = Math.round(Math.max(16, r.h * 0.035));
    const barH = Math.max(10, Math.round(r.h * 0.018));
    const barW = r.w - pad * 2;
    const timeRatio = Math.max(0, Math.min(1, this.timer.get() / this.config.duration));
    const clampedOpacity = Math.max(0, Math.min(1, opacity));
    if (clampedOpacity <= 0) return;

    const warning = timeRatio <= 0.15;
    const pulse = warning ? (Math.sin(this.time.get() * 18) + 1) / 2 : 0;
    const neonPrimary = warning ? '#ff4d6f' : '#5fe8ff';
    const neonSecondary = warning ? '#ffb347' : '#2f9dff';
    const fillWidth = Math.max(0, barW * timeRatio);
    const barY = r.h - pad - barH;
    const radius = barH / 2;

    const drawRoundedRect = (x: number, y: number, w: number, h: number, rads: number) => {
      const rad = Math.min(rads, Math.min(w, h) / 2);
      ctx.beginPath();
      ctx.moveTo(x + rad, y);
      ctx.lineTo(x + w - rad, y);
      ctx.quadraticCurveTo(x + w, y, x + w, y + rad);
      ctx.lineTo(x + w, y + h - rad);
      ctx.quadraticCurveTo(x + w, y + h, x + w - rad, y + h);
      ctx.lineTo(x + rad, y + h);
      ctx.quadraticCurveTo(x, y + h, x, y + h - rad);
      ctx.lineTo(x, y + rad);
      ctx.quadraticCurveTo(x, y, x + rad, y);
      ctx.closePath();
    };

    ctx.save();
    ctx.globalAlpha *= clampedOpacity;
    drawRoundedRect(pad, barY, barW, barH, radius);
    ctx.fillStyle = 'rgba(3, 8, 16, 0.9)';
    ctx.fill();
    ctx.lineWidth = Math.max(1.5, Math.round(barH * 0.08));
    ctx.strokeStyle = 'rgba(113, 147, 188, 0.25)';
    ctx.stroke();

    if (fillWidth > 0.5) {
      ctx.save();
      drawRoundedRect(pad, barY, fillWidth, barH, radius);
      ctx.clip();
      const gradient = ctx.createLinearGradient(pad, barY, pad + fillWidth, barY);
      gradient.addColorStop(0, neonSecondary);
      gradient.addColorStop(0.35, neonPrimary);
      gradient.addColorStop(1, warning ? '#ff305a' : '#64fff6');
      ctx.fillStyle = gradient;
      ctx.shadowColor = neonPrimary;
      const glow = warning ? 28 + pulse * 14 : 18 + timeRatio * 12;
      ctx.shadowBlur = glow;
      ctx.fillRect(pad, barY, fillWidth, barH);

      ctx.globalAlpha = 0.5 + (warning ? pulse * 0.5 : 0.2);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
      ctx.fillRect(pad + 6, barY + barH * 0.2, Math.max(0, fillWidth - 12), Math.max(2, barH * 0.18));

      const scanWidth = Math.max(20, barH * 2.4);
      const scanSpeed = (performance.now() % 1400) / 1400;
      const offset = scanSpeed * scanWidth * 2;
      ctx.globalAlpha = 0.18 + (warning ? pulse * 0.25 : 0);
      ctx.fillStyle = '#ffffff';
      for (let x = -scanWidth; x < fillWidth + scanWidth; x += scanWidth * 1.5) {
        ctx.beginPath();
        ctx.moveTo(pad + x + offset, barY);
        ctx.lineTo(pad + x + offset + scanWidth * 0.25, barY);
        ctx.lineTo(pad + x + offset - scanWidth * 0.25, barY + barH);
        ctx.lineTo(pad + x + offset - scanWidth * 0.5, barY + barH);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    }

    ctx.shadowBlur = 0;
    ctx.globalAlpha = clampedOpacity;
    const fontSize = Math.max(14, Math.round(r.h * 0.045));
    ctx.font = `${fontSize}px Orbitron, sans-serif`;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    const timeDisplay = Math.max(0, this.timer.get()).toFixed(1);
    const centerX = r.w / 2;
    const textY = barY + barH / 2;
    ctx.fillStyle = '#eaf1ff';
    ctx.strokeStyle = 'rgba(5, 10, 18, 0.9)';
    ctx.lineWidth = Math.max(1, Math.round(fontSize * 0.12));
    ctx.shadowColor = warning ? '#ff8aa6' : '#58e1ff';
    ctx.shadowBlur = warning ? 12 + pulse * 12 : 10;
    ctx.strokeText(timeDisplay, centerX, textY);
    ctx.fillText(timeDisplay, centerX, textY);

    const deltaActive = this.timeDeltaTimer > 0 && this.timeDeltaValue !== 0;
    if (deltaActive) {
      const magnitude = Math.abs(this.timeDeltaValue).toFixed(1).replace(/\.0$/, '');
      const sign = this.timeDeltaValue > 0 ? '+' : '-';
      const deltaText = `${sign} ${magnitude}`;
      const fade = Math.max(0, Math.min(1, this.timeDeltaTimer / TIME_DELTA_DISPLAY_SEC));
      const offsetY = Math.max(barH + fontSize * 0.25, Math.round(fontSize));
      ctx.save();
      ctx.globalAlpha = fade;
      ctx.fillStyle = this.timeDeltaValue > 0 ? '#7ee787' : '#ff9ba0';
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.4)';
      ctx.shadowColor = this.timeDeltaValue > 0 ? '#41ff9d' : '#ff5a7a';
      ctx.shadowBlur = 8;
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
  halt() { this.clock.stop(); }

  private pointInRect(x: number, y: number, rect: Rect | null) {
    if (!rect) return false;
    return x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height;
  }
}
