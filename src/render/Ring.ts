import { Renderer2D } from './Renderer2D';

export default class Ring {
  private renderer: Renderer2D;
  x: number;
  y: number;
  radius: number;

  constructor(renderer: Renderer2D, x = 0, y = 0, radius = 20) {
    this.renderer = renderer;
    this.x = x;
    this.y = y;
    this.radius = radius;
  }

  render() {
    const ctx = this.renderer.ctx;
    ctx.save();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}
