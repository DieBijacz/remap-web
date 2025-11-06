import { clearCanvas, fillRoundedRect, strokeRoundedRect } from '../canvasUtils';
import type { HighscoreEntry } from '../../storage/HighscoreStore';

const LEADERBOARD_LIMIT = 10;

export type LeaderboardScreenData = {
  entries: HighscoreEntry[];
  highlightIndex: number | null;
  finalScore: number;
  playerName: string | null;
  fromGame: boolean;
  didQualify: boolean;
};

const DEFAULT_DATA: LeaderboardScreenData = {
  entries: [],
  highlightIndex: null,
  finalScore: 0,
  playerName: null,
  fromGame: false,
  didQualify: false
};

export class LeaderboardScreen {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private data: LeaderboardScreenData = DEFAULT_DATA;

  constructor(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D) {
    this.canvas = canvas;
    this.ctx = ctx;}

  setData(data: LeaderboardScreenData) {
    this.data = {
      ...DEFAULT_DATA,
      ...data,
      entries: [...data.entries]
    };
  }

  draw() {
    const { canvas, ctx } = this;
    const w = canvas.width;
    const h = canvas.height;

    clearCanvas(canvas, ctx);
    ctx.save();
    ctx.fillStyle = '#0d1117';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(6, 10, 18, 0.78)';
    ctx.fillRect(0, 0, w, h);
    ctx.restore();

    const rows = this.buildRows();
    const hasEntries = rows.some((entry) => entry);
    const highlight = this.getHighlightIndex();

    const paddingX = Math.max(24, Math.round(w * 0.06));
    const paddingY = Math.max(20, Math.round(h * 0.035));
    const titleSize = Math.max(28, Math.round(h * 0.055));
    const rowHeight = Math.max(30, Math.round(h * 0.05));
    const gapAfterTitle = Math.max(18, Math.round(h * 0.024));
    const instructionsSize = Math.max(16, Math.round(h * 0.028));
    const panelWidth = Math.min(Math.round(w * 0.78), 780);

    const subtitleSize = Math.max(18, Math.round(h * 0.032));
    const subtitleGap = Math.max(12, Math.round(h * 0.018));

    const rowsHeight = rows.length * rowHeight;
    const basePanelHeight =
      paddingY * 2 +
      titleSize +
      subtitleSize +
      subtitleGap +
      gapAfterTitle +
      rowsHeight +
      gapAfterTitle +
      instructionsSize;

    const panelHeight = basePanelHeight;
    const panelX = (w - panelWidth) / 2;
    const panelY = Math.max(h * 0.08, (h - panelHeight) / 2);
    const panelRadius = Math.min(32, panelHeight * 0.08);

    ctx.save();
    ctx.fillStyle = 'rgba(12, 18, 28, 0.95)';
    fillRoundedRect(ctx, panelX, panelY, panelWidth, panelHeight, panelRadius);
    ctx.restore();
    ctx.save();
    ctx.strokeStyle = 'rgba(121, 192, 255, 0.32)';
    ctx.lineWidth = 2;
    strokeRoundedRect(ctx, panelX, panelY, panelWidth, panelHeight, panelRadius);
    ctx.restore();

    let rowY = panelY + paddingY;
    ctx.save();
    ctx.font = `${titleSize}px Orbitron, sans-serif`;
    ctx.fillStyle = '#79c0ff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('Top Scores', w / 2, rowY);
    ctx.restore();

    rowY += titleSize + Math.max(8, Math.round(h * 0.012));

    const subtitleText = this.getSubtitleText(hasEntries);
    ctx.save();
    ctx.font = `${subtitleSize}px Orbitron, sans-serif`;
    ctx.fillStyle = 'rgba(205, 217, 229, 0.9)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(subtitleText, w / 2, rowY);
    ctx.restore();

    rowY += subtitleSize + subtitleGap;

    const rankWidth = Math.max(40, Math.round(panelWidth * 0.1));
    const rowWidth = panelWidth - paddingX * 2;
    const rowFontSize = Math.max(18, Math.round(rowHeight * 0.55));

    rows.forEach((entry, index) => {
      const centerY = rowY + rowHeight / 2;
      const isHighlight = highlight === index;
      if (isHighlight) {
        ctx.save();
        ctx.fillStyle = 'rgba(121, 192, 255, 0.18)';
        fillRoundedRect(
          ctx,
          panelX + paddingX,
          rowY,
          rowWidth,
          rowHeight,
          Math.min(10, rowHeight * 0.35)
        );
        ctx.restore();
      }

      ctx.save();
      ctx.font = `${rowFontSize}px Orbitron, sans-serif`;
      ctx.fillStyle = entry ? (isHighlight ? '#79c0ff' : '#e2e8f0') : 'rgba(148, 163, 184, 0.6)';
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'left';
      const rankText = `${(index + 1).toString().padStart(2, '0')}.`;
      ctx.fillText(rankText, panelX + paddingX, centerY);
      const name = entry ? entry.name : '---';
      ctx.fillText(name, panelX + paddingX + rankWidth, centerY);
      ctx.textAlign = 'right';
      const scoreText = entry ? entry.score.toLocaleString() : '---';
      ctx.fillText(scoreText, panelX + paddingX + rowWidth, centerY);
      ctx.restore();

      rowY += rowHeight;
    });

    const instructions = this.data.fromGame
      ? 'Press Enter to continue'
      : 'Press Enter or Esc to return';
    const instructionsY = panelY + panelHeight - paddingY - instructionsSize;
    ctx.save();
    ctx.font = `${instructionsSize}px Orbitron, sans-serif`;
    ctx.fillStyle = 'rgba(205, 217, 229, 0.9)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(instructions, w / 2, instructionsY);
    ctx.restore();

    if (this.data.fromGame && !this.data.didQualify) {
      const boxWidth = Math.min(panelWidth, w * 0.7);
      const boxHeight = Math.max(72, Math.round(h * 0.1));
      const boxX = (w - boxWidth) / 2;
      const boxY = Math.min(
        h - boxHeight - Math.max(32, h * 0.08),
        panelY + panelHeight + Math.max(32, h * 0.06)
      );
      const boxRadius = Math.min(24, boxHeight * 0.4);
      ctx.save();
      ctx.fillStyle = 'rgba(12, 18, 28, 0.92)';
      fillRoundedRect(ctx, boxX, boxY, boxWidth, boxHeight, boxRadius);
      ctx.strokeStyle = 'rgba(121, 192, 255, 0.3)';
      ctx.lineWidth = 2;
      strokeRoundedRect(ctx, boxX, boxY, boxWidth, boxHeight, boxRadius);
      ctx.font = `${Math.max(18, Math.round(boxHeight * 0.32))}px Orbitron, sans-serif`;
      ctx.fillStyle = 'rgba(205, 217, 229, 0.82)';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('Final Score', w / 2, boxY + boxHeight * 0.35);
      ctx.font = `${Math.max(30, Math.round(boxHeight * 0.5))}px Orbitron, sans-serif`;
      ctx.fillStyle = '#f8fafc';
      ctx.fillText(this.data.finalScore.toLocaleString(), w / 2, boxY + boxHeight * 0.72);
      ctx.restore();
    }
  }

  handleKey(e: KeyboardEvent) {
    if (['ArrowUp', 'ArrowRight', 'ArrowDown', 'ArrowLeft'].includes(e.key)) {
      e.preventDefault();
      return false;
    }
    if (['Enter', 'Escape', ' '].includes(e.key)) {
      e.preventDefault();
      return true;
    }
    return false;
  }

  handleClick() {
    return true;
  }

  private buildRows() {
    const rows: Array<HighscoreEntry | null> = this.data.entries
      .slice(0, LEADERBOARD_LIMIT)
      .map((entry) => (entry ? { ...entry } : null));
    while (rows.length < LEADERBOARD_LIMIT) {
      rows.push(null);
    }
    return rows;
  }

  private getSubtitleText(hasEntries: boolean) {
    if (!hasEntries) {
      return 'No scores recorded yet';
    }
    if (!this.data.fromGame) {
      return 'Best results across all sessions';
    }
    if (this.data.didQualify) {
      return this.data.playerName
        ? `${this.data.playerName} joined the leaderboard!`
        : 'A new score entered the leaderboard!';
    }
    return `Final Score ${this.data.finalScore.toLocaleString()}`;
  }

  private getHighlightIndex() {
    const { highlightIndex } = this.data;
    if (highlightIndex == null) {
      return null;
    }
    if (highlightIndex < 0 || highlightIndex >= LEADERBOARD_LIMIT) {
      return null;
    }
    return highlightIndex;
  }
}

