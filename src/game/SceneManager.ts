import type { Scene } from '../core/types';

export default class SceneManager {
  private scenes: Scene[] = [];

  push(scene: Scene) {
    this.scenes.push(scene);
    scene.start?.();
  }

  pop() {
    const s = this.scenes.pop();
    s?.stop?.();
    return s;
  }

  update(tick: any) {
    const s = this.scenes[this.scenes.length - 1];
    s?.update?.(tick);
  }

  render(ctx: CanvasRenderingContext2D) {
    const s = this.scenes[this.scenes.length - 1];
    s?.render?.(ctx);
  }
}
