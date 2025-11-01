export type SymbolType = 'square' | 'circle' | 'triangle' | 'cross';

export interface Symbol {
  type: SymbolType;
  x: number;
  y: number;
  scale: number;
  rotation: number;
}

export const createSymbol = (x: number, y: number, type: SymbolType): Symbol => ({
  type,
  x,
  y,
  scale: 1,
  rotation: 0
});

const NEON_COLORS: Record<SymbolType, { glow: string; inner: string; ambient: string }> = {
  square: { glow: '#ffd95a', inner: '#fff9e6', ambient: 'rgba(255, 217, 90, 0.35)' },
  circle: { glow: '#ff63c0', inner: '#ffe6f8', ambient: 'rgba(255, 99, 192, 0.32)' },
  triangle: { glow: '#4fe49b', inner: '#edfff6', ambient: 'rgba(79, 228, 155, 0.30)' },
  cross: { glow: '#59b8ff', inner: '#ecf6ff', ambient: 'rgba(89, 184, 255, 0.28)' }
};

const tracePath = (ctx: CanvasRenderingContext2D, type: SymbolType, size: number, shrink = 0) => {
  const effective = size - shrink * 2;
  switch (type) {
    case 'square': {
      const half = effective / 2;
      ctx.rect(-half, -half, effective, effective);
      break;
    }
    case 'circle': {
      ctx.arc(0, 0, effective / 2, 0, Math.PI * 2);
      break;
    }
    case 'triangle': {
      const half = effective / 2;
      const topY = -effective * 0.62;
      const baseY = effective * 0.34;
      ctx.moveTo(-half, baseY);
      ctx.lineTo(0, topY);
      ctx.lineTo(half, baseY);
      ctx.closePath();
      break;
    }
    case 'cross': {
      const arm = effective / 2;
      ctx.moveTo(-arm, -arm);
      ctx.lineTo(arm, arm);
      ctx.moveTo(arm, -arm);
      ctx.lineTo(-arm, arm);
      break;
    }
  }
};

export const drawSymbol = (
  ctx: CanvasRenderingContext2D,
  symbol: Symbol,
  isTarget: boolean = false,
  strokeScale: number = 1
) => {
  const { x, y, scale, rotation, type } = symbol;
  const palette = NEON_COLORS[type];
  const size = 46 * scale;
  const glowLine = size * (type === 'cross' ? 0.10 : 0.09) * strokeScale;
  const innerLine = size * (type === 'cross' ? 0.06 : 0.048) * strokeScale;
  const glowBoost = Math.max(0.6, Math.min(1.6, strokeScale));
  const baseGlow = (isTarget ? 52 : 34) * glowBoost;

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotation);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // Outer glow stroke
  ctx.beginPath();
  tracePath(ctx, type, size);
  ctx.lineWidth = glowLine;
  ctx.strokeStyle = palette.glow;
  ctx.shadowColor = palette.glow;
  ctx.shadowBlur = baseGlow;
  ctx.globalAlpha = 0.92;
  ctx.stroke();

  // Ambient fill for solid shapes
  if (type !== 'cross') {
    const gradient = ctx.createRadialGradient(0, 0, size * 0.05, 0, 0, size * 0.6);
    gradient.addColorStop(0, 'rgba(255,255,255,0.55)');
    gradient.addColorStop(0.45, palette.ambient);
    gradient.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.beginPath();
    tracePath(ctx, type, size, size * 0.02);
    ctx.fillStyle = gradient;
    ctx.globalAlpha = 0.55;
    ctx.shadowBlur = isTarget ? 26 : 18;
    ctx.shadowColor = palette.glow;
    ctx.fill();
  }

  // Inner bright stroke
  ctx.beginPath();
  tracePath(ctx, type, size, size * 0.015);
  ctx.lineWidth = innerLine;
  ctx.strokeStyle = palette.inner;
  ctx.shadowColor = 'rgba(255,255,255,0.65)';
  ctx.shadowBlur = isTarget ? 22 : 14;
  ctx.globalAlpha = 1;
  ctx.stroke();

  ctx.restore();
};
