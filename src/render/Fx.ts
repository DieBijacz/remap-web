import { Renderer2D } from './Renderer2D';

export default class Fx {
  private renderer: Renderer2D;

  constructor(renderer: Renderer2D) {
    this.renderer = renderer;
  }

  // placeholder for simple effects
  spark(x: number, y: number) {
    const ctx = this.renderer.ctx;
    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.fillRect(x - 2, y - 2, 4, 4);
    ctx.restore();
  }
}
