import { clearCanvas, drawButton, pointInRect } from '../canvasUtils';

export interface MenuActions {
  onStart: () => void;
  onShowLeaderboard: () => void;
  onShowSettings: () => void;
}

export class MenuScreen {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private startButtonRect: DOMRect | null = null;
  private leaderboardButtonRect: DOMRect | null = null;
  private settingsButtonRect: DOMRect | null = null;

  constructor(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D) {
    this.canvas = canvas;
    this.ctx = ctx;}

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

    const btnW = Math.round(cssW * 0.4);
    const btnH = Math.max(40, Math.round(cssH * 0.08));
    const btnX = Math.round((cssW - btnW) / 2);
    const startY = Math.round(cssH * 0.38);
    const leaderboardY = startY + btnH + 16;
    const settingsY = leaderboardY + btnH + 16;

    ctx.font = `${Math.max(16, Math.round(cssH * 0.04))}px Orbitron, sans-serif`;
    drawButton(ctx, btnX, startY, btnW, btnH, 'Start Game');
    drawButton(ctx, btnX, leaderboardY, btnW, btnH, 'Leaderboard');
    drawButton(ctx, btnX, settingsY, btnW, btnH, 'Settings');

    this.startButtonRect = new DOMRect(btnX, startY, btnW, btnH);
    this.leaderboardButtonRect = new DOMRect(btnX, leaderboardY, btnW, btnH);
    this.settingsButtonRect = new DOMRect(btnX, settingsY, btnW, btnH);

    const hintY = settingsY + btnH + Math.max(28, Math.round(cssH * 0.05));
    ctx.font = `${Math.max(12, Math.round(cssH * 0.03))}px Orbitron, sans-serif`;
    ctx.fillStyle = 'rgba(148, 163, 184, 0.85)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('Press O for Settings • Arrow keys navigate menus in-game', cssW / 2, hintY);

    ctx.restore();
  }

  handleClick(x: number, y: number, actions: MenuActions): boolean {
    if (pointInRect(x, y, this.startButtonRect)) {
      actions.onStart();
      return true;
    }
    if (pointInRect(x, y, this.leaderboardButtonRect)) {
      actions.onShowLeaderboard();
      return true;
    }
    if (pointInRect(x, y, this.settingsButtonRect)) {
      actions.onShowSettings();
      return true;
    }
    return false;
  }
}

