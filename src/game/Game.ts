import { Clock, PausableTime } from '../core/Clock';
import { Renderer2D } from '../render/Renderer2D';
import { AnimationTimeline, easeOutCubic } from '../core/Animation';
import { Timer } from '../core/Timer';
import { drawSymbol } from '../render/Symbols';
import type { Symbol } from '../render/Symbols';
import type { SymbolType } from '../render/Symbols';
import type { InputHandler } from '../input/InputManager';
import { InputManager } from '../input/InputManager';
import { EffectsManager } from '../fx/EffectsManager';
import { AudioManager } from '../audio/AudioManager';
import HighscoreStore from '../storage/HighscoreStore';
import ConfigStore from '../storage/ConfigStore';
import type { Config as PersistentConfig } from '../storage/ConfigStore';

const RING_SYMBOL_TYPES: SymbolType[] = ['triangle', 'square', 'circle', 'cross'];
const RING_SYMBOL_SCALE = 1.22;
const CENTER_BASE_SCALE = 1.85;
const CENTER_MIN_SCALE = CENTER_BASE_SCALE * 0.4;
const TIME_DELTA_DISPLAY_SEC = 1.1;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

interface GameConfig {
  duration: number;        // Game duration in seconds
  timePenalty: number;     // Time lost on wrong answer
  symbolCount: number;     // Number of symbols to display
  maxTimeBonus: number;    // Maximum extra time rewarded
  minTimeBonus: number;    // Minimum extra time rewarded
  bonusWindow: number;     // Seconds window for full bonus
  ringRadiusFactor: number;// Relative radius of outer ring
}

export class Game implements InputHandler {
  private clock = new Clock();
  private time = new PausableTime();
  private renderer: Renderer2D;
  private anim = new AnimationTimeline();
  private input: InputManager;
  private effects: EffectsManager;
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
    ringRadiusFactor: 0.18
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
    ringRadiusFactor: 0.18
  };

  private timer: Timer;
  private symbols: Symbol[] = [];
  private currentTargetIndex = 0;
  private centerSymbol: SymbolType = 'triangle';
  private centerPos = { x: 0, y: 0 };
  private centerScale = CENTER_BASE_SCALE;
  private centerOpacity = 1;
  private promptSpawnTime = 0;
  private isGameOver = false;
  private configStore: ConfigStore | null = null;

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
      this.audio.load('correct', '/sounds/correct.mp3', 0.5),
      this.audio.load('wrong', '/sounds/wrong.mp3', 0.3),
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
    const idx = Math.floor(Math.random() * candidates.length);
    return candidates[idx] ?? this.centerSymbol;
  }

  private applyCenterSymbol(next: SymbolType, opts?: { resetVisual?: boolean }) {
    this.centerSymbol = next;
    const matchIdx = this.symbols.findIndex((symbol) => symbol.type === next);
    this.currentTargetIndex = matchIdx >= 0 ? matchIdx : 0;
    const { x: cx, y: cy } = this.getCanvasCenter();
    this.centerPos.x = cx;
    this.centerPos.y = cy;
    if (opts?.resetVisual !== false) {
      this.centerScale = CENTER_BASE_SCALE;
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
      ringRadiusFactor: clamp(data.ringRadiusFactor ?? this.defaults.ringRadiusFactor, 0.08, 0.3)
    };
    // Ensure floor is not above ceiling
    if (merged.minTimeBonus > merged.maxTimeBonus) {
      merged.minTimeBonus = merged.maxTimeBonus;
    }
    this.config = merged;
    if (this.symbols.length > 0) {
      this.updateRingLayout();
    }
  }

  private computeRingLayout() {
    const { w, h } = this.renderer;
    const radius = Math.round(w * this.config.ringRadiusFactor);
    const center = { x: w / 2, y: h / 2 };
    return [
      { type: 'triangle' as SymbolType, x: center.x, y: center.y - radius },
      { type: 'square' as SymbolType, x: center.x - radius, y: center.y },
      { type: 'circle' as SymbolType, x: center.x + radius, y: center.y },
      { type: 'cross' as SymbolType, x: center.x, y: center.y + radius }
    ];
  }

  private updateRingLayout() {
    const layout = this.computeRingLayout();
    layout.forEach((pos, index) => {
      const symbol = this.symbols[index];
      if (symbol) {
        symbol.x = pos.x;
        symbol.y = pos.y;
        symbol.scale = RING_SYMBOL_SCALE;
      }
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
    const disappearScale = options?.disappearScale ?? CENTER_BASE_SCALE * 0.55;
    const enterScale = options?.enterScale ?? CENTER_MIN_SCALE;

    this.centerPos.x = center.x;
    this.centerPos.y = center.y;

    this.anim.play({
      duration: exitDuration,
      onUpdate: (p) => {
        const t = easeOutCubic(p);
        this.centerPos.x = lerp(center.x, target.x, t);
        this.centerPos.y = lerp(center.y, target.y, t);
        this.centerScale = lerp(CENTER_BASE_SCALE, disappearScale, t);
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
            this.centerScale = lerp(enterScale, CENTER_BASE_SCALE, t2);
            this.centerOpacity = Math.min(1, t2 * 1.1);
          },
          onDone: () => {
            this.centerPos.x = center.x;
            this.centerPos.y = center.y;
            this.centerScale = CENTER_BASE_SCALE;
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
    type Direction = 'up' | 'right' | 'down' | 'left';
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

  private handleInput(inputDir: 'up' | 'right' | 'down' | 'left') {
    console.log('[debug] handleInput', { inputDir, symbolCount: this.symbols.length });

    // Map direction to symbol index (we created symbols in order: top, left, right, bottom)
    const dirToIndex: Record<string, number> = {
      up: 0,
      left: 1,
      right: 2,
      down: 3
    };

    const idx = (dirToIndex as any)[inputDir];
    const ringSymbol = this.symbols[idx];
    if (!ringSymbol) {
      console.warn('[debug] handleInput - no ring symbol for direction', inputDir);
      return;
    }

    console.log('[debug] centerSymbol', this.centerSymbol, 'ringSymbol', ringSymbol.type);

    if (ringSymbol.type === this.centerSymbol) {
      // Correct answer
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

      const next = this.getRandomSymbolType(this.centerSymbol);
      this.anim.clear();
      this.animateCenterSwap(next, {
        targetPos: { x: ringSymbol.x, y: ringSymbol.y },
        exitDuration: 0.24,
        appearDuration: 0.34,
        offsetRatio: 0.085
      });

      // Occasionally reshuffle the ring
      if (this.score % 500 === 0) {
        this.initSymbols();
      }
    } else {
      // Wrong answer
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
        disappearScale: CENTER_BASE_SCALE * 0.5
      });
    }

    // Update HUD (score will be drawn on the canvas in draw())
  }

  private initSymbols() {
    const layout = this.computeRingLayout();
    this.symbols = layout.map((pos) => ({
      type: pos.type,
      x: pos.x,
      y: pos.y,
      scale: RING_SYMBOL_SCALE,
      rotation: 0
    }));

    this.applyCenterSymbol(this.getRandomSymbolType());
    this.centerScale = CENTER_BASE_SCALE;
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
    this.syncHighscore();
    this.timer.set(this.config.duration);
    this.initSymbols();
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
    if (this.timeDeltaTimer > 0) {
      this.timeDeltaTimer = Math.max(0, this.timeDeltaTimer - dt);
      if (this.timeDeltaTimer <= 0.0001) {
        this.timeDeltaValue = 0;
        this.timeDeltaTimer = 0;
      }
    }

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

    // Draw symbols
    this.symbols.forEach((symbol) => {
      // ring answers are not the current prompt; draw with normal glow
      drawSymbol(r.ctx, symbol, false);
    });

    // Draw center prompt symbol larger in the middle (may be animating)
    const centerX = this.centerPos.x || r.w / 2;
    const centerY = this.centerPos.y || r.h / 2;
    const centerSym: Symbol = { type: this.centerSymbol, x: centerX, y: centerY, scale: this.centerScale, rotation: 0 };
    r.ctx.save();
    r.ctx.globalAlpha = this.centerOpacity;
    drawSymbol(r.ctx, centerSym, true);
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
