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

export const drawSymbol = (
  ctx: CanvasRenderingContext2D,
  symbol: Symbol,
  isTarget: boolean = false
) => {
  const { x, y, scale, rotation, type } = symbol;
  const size = 40 * scale;

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotation);
  // neon color and shadow per type
  let color = '#ffffff';
  let shadow = 'rgba(255,255,255,0.6)';
  switch (type) {
    case 'square':
      color = '#FFE135';
      shadow = 'rgba(255,225,53,0.9)';
      break;
    case 'circle':
      color = '#FF3366';
      shadow = 'rgba(255,51,102,0.9)';
      break;
    case 'triangle':
      color = '#2ea043';
      shadow = 'rgba(46,160,67,0.9)';
      break;
    case 'cross':
      color = '#00A6ED';
      shadow = 'rgba(0,166,237,0.9)';
      break;
  }

  ctx.beginPath();
  ctx.lineWidth = 4;
  ctx.strokeStyle = color;
  ctx.shadowColor = shadow;
  ctx.shadowBlur = isTarget ? 24 : 12;

  switch (type) {
    case 'square':
      ctx.rect(-size / 2, -size / 2, size, size);
      break;
    case 'circle':
      ctx.arc(0, 0, size / 2, 0, Math.PI * 2);
      break;
    case 'triangle':
      ctx.moveTo(-size / 2, size / 3);
      ctx.lineTo(0, -size / 2);
      ctx.lineTo(size / 2, size / 3);
      ctx.closePath();
      break;
    case 'cross':
      // draw two crossing lines
      ctx.moveTo(-size / 2, -size / 2);
      ctx.lineTo(size / 2, size / 2);
      ctx.moveTo(size / 2, -size / 2);
      ctx.lineTo(-size / 2, size / 2);
      break;
  }

  ctx.stroke();
  // reset shadow
  ctx.shadowBlur = 0;
  ctx.shadowColor = 'transparent';
  ctx.restore();
};
