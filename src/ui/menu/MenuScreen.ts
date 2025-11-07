import type { Action } from '../../input/Keymap';
import { clearCanvas, drawButton, pointInRect } from '../canvasUtils';

export interface MenuActions {
  onStart: () => void;
}

export class MenuScreen {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private startButtonRect: DOMRect | null = null;
  private startButtonFocused = true;

  constructor(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D) {
    this.canvas = canvas;
    this.ctx = ctx;
  }

  draw() {
    clearCanvas(this.canvas, this.ctx);
    const cssW = this.canvas.clientWidth;
    const cssH = this.canvas.clientHeight;
    const { ctx } = this;
    ctx.save();

    const titleSize = Math.max(36, Math.round(cssH * 0.08));
    ctx.font = `${titleSize}px Orbitron, sans-serif`;
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('Remap', cssW / 2, cssH * 0.12);

    const btnW = Math.round(cssW * 0.45);
    const btnH = Math.max(56, Math.round(cssH * 0.1));
    const btnX = Math.round((cssW - btnW) / 2);
    const startY = Math.round(cssH * 0.5 - btnH / 2);
    const fontSize = Math.max(18, Math.round(cssH * 0.045));
    const fillStyle = this.startButtonFocused ? '#2ea043' : '#238636';

    drawButton(ctx, btnX, startY, btnW, btnH, 'Start Game', {
      fillStyle,
      font: `${fontSize}px Orbitron, sans-serif`
    });
    this.startButtonRect = new DOMRect(btnX, startY, btnW, btnH);

    const hintY = startY + btnH + Math.max(36, Math.round(cssH * 0.08));
    ctx.font = `${Math.max(14, Math.round(cssH * 0.035))}px Orbitron, sans-serif`;
    ctx.fillStyle = 'rgba(148, 163, 184, 0.9)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('Press Enter to start - Press O to toggle settings', cssW / 2, hintY);

    ctx.restore();
  }

  handleAction(action: Action, actions: MenuActions): boolean {
    if (action === 'confirm') {
      actions.onStart();
      return true;
    }
    if (action === 'up' || action === 'down' || action === 'left' || action === 'right') {
      if (!this.startButtonFocused) {
        this.startButtonFocused = true;
        this.draw();
      }
    }
    return false;
  }

  handleClick(x: number, y: number, actions: MenuActions): boolean {
    if (pointInRect(x, y, this.startButtonRect)) {
      actions.onStart();
      return true;
    }
    return false;
  }
}

