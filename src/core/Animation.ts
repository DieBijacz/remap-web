export type Easer = (t: number) => number;

export const easeOutCubic: Easer = (t) => 1 - Math.pow(1 - t, 3);
export const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

export interface AnimSpec {
  duration: number; // sekundy
  onUpdate: (p: number) => void; // p ∈ [0,1]
  onDone?: () => void;
}

export class AnimationTimeline {
  private active: { t: number; spec: AnimSpec } | null = null;
  private queue: AnimSpec[] = [];

  play(spec: AnimSpec) {
    if (this.active) {
      this.queue.push(spec);
    } else {
      this.active = { t: 0, spec };
      spec.onUpdate(0);
    }
  }

  /** używaj w pętli update */
  tick(dt: number) {
    const a = this.active;
    if (!a) return;
    a.t += dt;
    const p = clamp01(a.t / Math.max(0.0001, a.spec.duration));
    a.spec.onUpdate(p);
    if (p >= 1) {
      a.spec.onDone?.();
      this.active = null;
      const next = this.queue.shift();
      if (next) this.play(next);
    }
  }

  /** czy coś „w locie” */
  isActive() { return !!this.active || this.queue.length > 0; }

  /** wyczyść kolejkę i aktywną animację (awaryjnie) */
  clear() { this.active = null; this.queue.length = 0; }
}
