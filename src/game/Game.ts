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

interface GameConfig {
  duration: number;      // Game duration in seconds
  timeGain: number;      // Time gained on correct answer
  timePenalty: number;   // Time lost on wrong answer
  symbolCount: number;   // Number of symbols to display
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
  private config: GameConfig = {
    duration: 45,
    timeGain: 3,
    timePenalty: 2,
    symbolCount: 4
  };

  private timer: Timer;
  private symbols: Symbol[] = [];
  private currentTargetIndex = 0;
  private centerSymbol: SymbolType = 'triangle';
  private centerPos = { x: 0, y: 0 };
  private isGameOver = false;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new Renderer2D(canvas);
    this.timer = new Timer(this.config.duration, this.time);
    this.input = new InputManager();
    this.effects = new EffectsManager(this.time);
    this.audio = new AudioManager();

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
      this.timer.add(this.config.timeGain);

      // Visual and sound feedback
      this.effects.flash('#2ea043', 0.2);
      this.effects.symbolPulse({ current: ringSymbol.scale });
      this.audio.play('correct');

      // Animate center symbol moving to the chosen ring position and back
      const center = { x: this.renderer.w / 2, y: this.renderer.h / 2 };
      // ensure centerPos initially set
      this.centerPos.x = center.x;
      this.centerPos.y = center.y;

      const types: SymbolType[] = ['square', 'circle', 'triangle', 'cross'];
      let next: SymbolType = types[Math.floor(Math.random() * types.length)];
      if (next === this.centerSymbol) {
        next = types[(types.indexOf(next) + 1) % types.length];
      }

      const outDuration = 0.28;
      const backDuration = 0.36;
      const targetPos = { x: ringSymbol.x, y: ringSymbol.y };

      const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

      // move out
      this.anim.play({
        duration: outDuration,
        onUpdate: (p) => {
          const t = easeOutCubic(p);
          this.centerPos.x = lerp(center.x, targetPos.x, t);
          this.centerPos.y = lerp(center.y, targetPos.y, t);
        },
        onDone: () => {
          // move back and then set new center symbol
          this.anim.play({
            duration: backDuration,
            onUpdate: (p2) => {
              const t2 = easeOutCubic(p2);
              this.centerPos.x = lerp(targetPos.x, center.x, t2);
              this.centerPos.y = lerp(targetPos.y, center.y, t2);
            },
            onDone: () => {
              this.centerPos.x = center.x;
              this.centerPos.y = center.y;
              this.centerSymbol = next;
            }
          });
        }
      });

      // Occasionally reshuffle the ring
      if (this.score % 500 === 0) {
        this.initSymbols();
      }
    } else {
      // Wrong answer
      this.timer.add(-this.config.timePenalty);
      this.effects.flash('#ff4433', 0.2);
      this.audio.play('wrong');
    }

  // Update HUD (score will be drawn on the canvas in draw())
  }

  private initSymbols() {
  // fixed default positions: triangle top, square left, circle right, cross bottom
  const { w, h } = this.renderer;
  // set ring radius so symbols are at a fixed proportion of the canvas width (10vw equivalent)
  const radius = Math.round(w * 0.10);
  const center = { x: w / 2, y: h / 2 };

    this.symbols = [];

    // Triangle (top)
    this.symbols.push({ type: 'triangle', x: center.x, y: center.y - radius, scale: 1, rotation: 0 });
    // Square (left)
    this.symbols.push({ type: 'square', x: center.x - radius, y: center.y, scale: 1, rotation: 0 });
    // Circle (right)
    this.symbols.push({ type: 'circle', x: center.x + radius, y: center.y, scale: 1, rotation: 0 });
    // Cross (bottom)
    this.symbols.push({ type: 'cross', x: center.x, y: center.y + radius, scale: 1, rotation: 0 });

    this.currentTargetIndex = Math.floor(Math.random() * this.symbols.length);
    // initialize center drawing position
    this.centerPos.x = center.x;
    this.centerPos.y = center.y;
    console.log('[debug] initSymbols created', this.symbols.length, 'symbols, currentTargetIndex=', this.currentTargetIndex, 'types=', this.symbols.map(s => s.type));
  }

  start() {
    this.isGameOver = false;
    this.score = 0;
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

    // get current remaining time as float (used for game over check)
    const timeLeftFloat = this.timer.get();

    // Check for game over
    if (timeLeftFloat <= 0) {
      this.isGameOver = true;
      this.input.removeHandler(this);
      this.audio.play('gameover');
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
    const centerSym: Symbol = { type: this.centerSymbol, x: centerX, y: centerY, scale: 1.6, rotation: 0 };
    drawSymbol(r.ctx, centerSym, true);

  // Draw score centered at the top as a plain number (no label)
  r.ctx.save();
  const scoreFontSize = Math.max(24, Math.round(r.h * 0.08));
  r.ctx.font = `${scoreFontSize}px Orbitron, sans-serif`;
  r.ctx.fillStyle = '#ffffff';
  r.ctx.textAlign = 'center';
  r.ctx.textBaseline = 'top';
  // subtle shadow for readability
  r.ctx.shadowColor = 'rgba(0,0,0,0.6)';
  r.ctx.shadowBlur = 6;
  const scoreText = `${this.score}`;
  const hudPad = Math.round(Math.max(8, r.h * 0.02));
  const scoreX = Math.round(r.w / 2);
  const scoreY = Math.round(hudPad);
  r.ctx.fillText(scoreText, scoreX, scoreY);
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

    // draw time number above the timebar, centered, one decimal place
    r.ctx.save();
    const fontSize = Math.max(12, Math.round(r.h * 0.04));
    r.ctx.font = `${fontSize}px sans-serif`;
    r.ctx.fillStyle = '#ffffff';
    r.ctx.textAlign = 'center';
    r.ctx.textBaseline = 'bottom';
    // compute display value here (one decimal)
    const timeDisplay = Math.max(0, this.timer.get()).toFixed(1);
    // position the timer slightly above the bar
    r.ctx.fillText(timeDisplay, r.w / 2, barY - Math.max(4, Math.round(r.h * 0.01)));
    r.ctx.restore();

    // Draw animated banner placeholder
    this.drawEasingBanner();
  }

  private drawEasingBanner() {
    const t = (Math.sin(this.time.get() * 2.0) * 0.5 + 0.5); // 0..1
    const k = easeOutCubic(t);
    const { width, height } = this.renderer.canvas;
    const ctx = this.renderer.ctx;

    ctx.save();
    ctx.globalAlpha = 0.3 + 0.3 * k;
    ctx.fillStyle = '#78c6ff';
    ctx.fillRect(width / 2 - 120, height / 2 - 140, 240, 30);
    ctx.restore();
  }

  // Public API methods
  addTime(seconds: number) { this.timer.add(seconds); }
  setTime(seconds: number) { this.timer.set(seconds); }
  pauseLayer() { this.time.pauseLayer(); }
  resumeLayer() { this.time.resumeLayer(); }
}
