const clampRadius = (radius: number, width: number, height: number) => {
  const maxRadius = Math.min(width, height) / 2;
  if (radius < 0) return 0;
  if (radius > maxRadius) return maxRadius;
  return radius;
};

export function buildRoundedRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
) {
  const r = clampRadius(radius, width, height);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

export function fillRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
) {
  buildRoundedRectPath(ctx, x, y, width, height, radius);
  ctx.fill();
}

export function strokeRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
) {
  buildRoundedRectPath(ctx, x, y, width, height, radius);
  ctx.stroke();
}

export function drawButton(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  label: string,
  options: {
    fillStyle?: string;
    textColor?: string;
    font?: string;
  } = {}
) {
  const radius = Math.min(12, height * 0.2);
  ctx.save();
  ctx.fillStyle = options.fillStyle ?? '#238636';
  fillRoundedRect(ctx, x, y, width, height, radius);
  ctx.fillStyle = options.textColor ?? '#fff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (options.font) {
    ctx.font = options.font;
  }
  ctx.fillText(label, x + width / 2, y + height / 2);
  ctx.restore();
}

export function clearCanvas(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D) {
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.restore();
}

export function pointInRect(x: number, y: number, rect: DOMRect | null) {
  if (!rect) return false;
  return x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height;
}
