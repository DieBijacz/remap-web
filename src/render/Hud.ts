import { Renderer2D } from './Renderer2D';

export default class Hud {
  private renderer: Renderer2D;
  private score = 0;

  constructor(renderer: Renderer2D) {
    this.renderer = renderer;
  }

  setScore(s: number) {
    this.score = s;
  }

  render() {
    const ctx = this.renderer.ctx;
    ctx.save();
    ctx.fillStyle = '#fff';
    ctx.font = '16px sans-serif';
    ctx.fillText(`Score: ${this.score}`, 10, 20);
    ctx.restore();
  }
}
