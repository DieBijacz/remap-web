import { easeOutCubic } from '../core/Animation';

interface Effect {
  duration: number;    // Duration in seconds
  elapsed: number;     // Time elapsed
  onUpdate: (t: number) => void;  // t is 0..1
  onComplete?: () => void;
}

export class EffectsManager {
  private effects: Effect[] = [];
  constructor() {
    // no-op; time parameter removed because it's not currently used
  }

  addEffect(effect: Effect) {
    this.effects.push({
      ...effect,
      elapsed: 0
    });
  }

  flash(color: string, duration = 0.2, maxOpacity = 0.3) {
    let overlay: HTMLDivElement | null = document.createElement('div');
    overlay.style.position = 'fixed';
    overlay.style.top = '0';
    overlay.style.left = '0';
    overlay.style.width = '100%';
    overlay.style.height = '100%';
    overlay.style.backgroundColor = color;
    overlay.style.pointerEvents = 'none';
    overlay.style.transition = `opacity ${duration}s ease-out`;
    overlay.style.opacity = String(maxOpacity);

    document.body.appendChild(overlay);

    // Force reflow
    overlay.offsetHeight;

    this.addEffect({
      duration,
      elapsed: 0,
      onUpdate: (t) => {
        if (overlay) {
          overlay.style.opacity = String(maxOpacity * (1 - easeOutCubic(t)));
        }
      },
      onComplete: () => {
        overlay?.remove();
        overlay = null;
      }
    });
  }

  symbolPulse(scale: { current: number }, duration = 0.3) {
    const startScale = scale.current;
    const pulseScale = 1.2;

    this.addEffect({
      duration,
      elapsed: 0,
      onUpdate: (t) => {
        const et = easeOutCubic(t);
        scale.current = startScale + (pulseScale - startScale) * (1 - et);
      }
    });
  }

  update(dt: number) {
    // Update all effects
    for (let i = this.effects.length - 1; i >= 0; i--) {
      const effect = this.effects[i];
      effect.elapsed += dt;

      const t = Math.min(1, effect.elapsed / effect.duration);
      effect.onUpdate(t);

      if (t >= 1) {
        effect.onComplete?.();
        this.effects.splice(i, 1);
      }
    }
  }
}
