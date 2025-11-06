export type SymbolTheme = 'classic' | 'pacman';

export type SymbolType =
  | 'square'
  | 'circle'
  | 'triangle'
  | 'cross'
  | 'pacman'
  | 'ghost-pink'
  | 'ghost-blue'
  | 'ghost-orange';

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

export const SYMBOL_THEME_SETS: Record<SymbolTheme, SymbolType[]> = {
  classic: ['triangle', 'square', 'circle', 'cross'],
  pacman: ['pacman', 'ghost-pink', 'ghost-blue', 'ghost-orange']
};

let pacmanEyesEnabled = true;

export const setPacmanEyesEnabled = (enabled: boolean) => {
  pacmanEyesEnabled = enabled;
};

export const arePacmanEyesEnabled = () => pacmanEyesEnabled;

export const SYMBOL_PALETTES: Record<SymbolType, { glow: string; inner: string; ambient: string }> = {
  square: { glow: '#ffd95a', inner: '#fff9e6', ambient: 'rgba(255, 217, 90, 0.35)' },
  circle: { glow: '#ff63c0', inner: '#ffe6f8', ambient: 'rgba(255, 99, 192, 0.32)' },
  triangle: { glow: '#4fe49b', inner: '#edfff6', ambient: 'rgba(79, 228, 155, 0.30)' },
  cross: { glow: '#59b8ff', inner: '#ecf6ff', ambient: 'rgba(89, 184, 255, 0.28)' },
  pacman: { glow: '#f8d94a', inner: '#fff4c4', ambient: 'rgba(248, 217, 74, 0.34)' },
  'ghost-pink': { glow: '#ff5ae0', inner: '#ffe6fb', ambient: 'rgba(255, 90, 224, 0.30)' },
  'ghost-blue': { glow: '#4fb8ff', inner: '#e6f4ff', ambient: 'rgba(79, 184, 255, 0.28)' },
  'ghost-orange': { glow: '#ff9b4a', inner: '#ffeddc', ambient: 'rgba(255, 155, 74, 0.32)' }
};

const isGhostType = (type: SymbolType): type is 'ghost-pink' | 'ghost-blue' | 'ghost-orange' =>
  type === 'ghost-pink' || type === 'ghost-blue' || type === 'ghost-orange';

const tracePath = (ctx: CanvasRenderingContext2D, type: SymbolType, size: number, shrink = 0) => {
  const effective = Math.max(0, size - shrink * 2);
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
    case 'pacman': {
      const radius = effective / 2;
      const mouthAngle = Math.PI / 5;
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, radius, mouthAngle, Math.PI * 2 - mouthAngle, false);
      ctx.closePath();
      break;
    }
    case 'ghost-pink':
    case 'ghost-blue':
    case 'ghost-orange': {
      const half = effective / 2;
      const headRadius = half;
      const headCenterY = -effective * 0.18;
      const baseY = headCenterY + headRadius;
      const footDepth = effective * 0.22;
      const footCount = 4;
      ctx.moveTo(-half, baseY);
      ctx.lineTo(-half, headCenterY);
      ctx.arc(0, headCenterY, headRadius, Math.PI, 0, false);
      ctx.lineTo(half, baseY);
      const step = (half * 2) / footCount;
      for (let i = footCount - 1; i >= 0; i -= 1) {
        const startX = -half + step * (i + 1);
        const endX = -half + step * i;
        const controlX = (startX + endX) / 2;
        ctx.quadraticCurveTo(controlX, baseY + footDepth, endX, baseY);
      }
      ctx.closePath();
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
  const palette = SYMBOL_PALETTES[type];
  const size = 46 * scale;
  const isGhost = isGhostType(type);
  const isPacman = type === 'pacman';
  const showEyes = pacmanEyesEnabled && (isGhost || isPacman);
  const glowLine = size * (type === 'cross' ? 0.1 : isGhost ? 0.088 : 0.09) * strokeScale;
  const innerLine = size * (type === 'cross' ? 0.06 : isGhost ? 0.05 : 0.048) * strokeScale;
  const glowBoost = Math.max(0.6, Math.min(1.6, strokeScale));
  const baseGlow = (isTarget ? 52 : 34) * glowBoost * (isGhost || isPacman ? 1.1 : 1);

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
    const gradient = isGhost
      ? ctx.createRadialGradient(-size * 0.1, -size * 0.12, size * 0.05, 0, 0, size * 0.72)
      : isPacman
        ? ctx.createRadialGradient(-size * 0.08, -size * 0.12, size * 0.04, 0, 0, size * 0.62)
        : ctx.createRadialGradient(0, 0, size * 0.05, 0, 0, size * 0.6);
    gradient.addColorStop(0, 'rgba(255,255,255,0.58)');
    gradient.addColorStop(isGhost ? 0.38 : isPacman ? 0.32 : 0.45, palette.ambient);
    gradient.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.beginPath();
    tracePath(ctx, type, size, size * (isGhost ? 0.018 : 0.02));
    ctx.fillStyle = gradient;
    ctx.globalAlpha = isGhost ? 0.65 : 0.55;
    ctx.shadowBlur = isTarget ? (isGhost ? 24 : 26) : isGhost ? 20 : 18;
    ctx.shadowColor = palette.glow;
    ctx.fill();
  }

  // Inner bright stroke
  ctx.beginPath();
  tracePath(ctx, type, size, size * (isGhost ? 0.02 : 0.015));
  ctx.lineWidth = innerLine;
  ctx.strokeStyle = palette.inner;
  ctx.shadowColor = isGhost || isPacman ? 'rgba(255,255,255,0.72)' : 'rgba(255,255,255,0.65)';
  ctx.shadowBlur = isTarget ? (isGhost || isPacman ? 26 : 22) : isGhost || isPacman ? 18 : 14;
  ctx.globalAlpha = 1;
  ctx.stroke();

  if (showEyes && isPacman) {
    ctx.save();
    ctx.shadowBlur = size * 0.08;
    ctx.shadowColor = 'rgba(255, 246, 210, 0.6)';
    ctx.fillStyle = 'rgba(255, 251, 230, 0.9)';
    ctx.beginPath();
    ctx.arc(size * 0.12, -size * 0.16, size * 0.055, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#0b1120';
    ctx.beginPath();
    ctx.arc(size * 0.16, -size * 0.16, size * 0.035, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  } else if (showEyes && isGhost) {
    ctx.save();
    const eyeOffsetY = -size * 0.12;
    const eyeSpacing = size * 0.26;
    const eyeRadius = size * 0.12;
    const pupilRadius = eyeRadius * 0.45;
    const pupilOffset = eyeRadius * 0.28;
    ctx.shadowBlur = size * 0.1;
    ctx.shadowColor = 'rgba(255,255,255,0.55)';
    const positions = [-eyeSpacing / 2, eyeSpacing / 2];
    positions.forEach((cx) => {
      ctx.fillStyle = '#f7fbff';
      ctx.beginPath();
      ctx.arc(cx, eyeOffsetY, eyeRadius, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#0c152a';
      ctx.beginPath();
      ctx.arc(cx + pupilOffset, eyeOffsetY, pupilRadius, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.restore();
  }

  ctx.restore();
};

