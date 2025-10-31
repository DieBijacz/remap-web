export class Renderer2D {
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D context not available');
    this.ctx = ctx;
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  get w() { return this.canvas.width; }
  get h() { return this.canvas.height; }

  resize() {
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const cssW = this.canvas.clientWidth || window.innerWidth;
    const cssH = this.canvas.clientHeight || window.innerHeight;
    this.canvas.width = Math.round(cssW * dpr);
    this.canvas.height = Math.round(cssH * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0); // rysujemy w „CSS px”

    // set responsive CSS variables on the canvas container so DOM symbols can size accordingly
    try {
      const container = this.canvas.parentElement || this.canvas;
      const base = Math.min(this.canvas.clientWidth, this.canvas.clientHeight);
      // symbol size smaller (~10% of smaller dimension), ring slightly larger (~16%)
      const symbolSize = Math.max(20, Math.round(base * 0.10));
      const ringSize = Math.max(28, Math.round(base * 0.16));
      container.style.setProperty('--symbol-size', `${symbolSize}px`);
      container.style.setProperty('--ring-size', `${ringSize}px`);
    } catch (e) {
      // ignore
    }
  }

  clear(color = '#0d1117') {
    const { ctx } = this;
    ctx.save();
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.restore();
  }
}
