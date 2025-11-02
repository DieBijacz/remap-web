type Vec2 = { x: number; y: number };

interface Particle {
  cx: number;
  cy: number;
  angle: number;
  radius: number;
  targetRadius: number;
  orbitSpeed: number;
  radialEase: number;
  wobblePhase: number;
  wobbleSpeed: number;
  wobbleAmplitude: number;
  size: number;
  color: string;
  baseAlpha: number;
  life: number;
  age: number;
}

export interface ParticleBurstOptions {
  center: Vec2;
  origin: Vec2;
  ringRadius: number;
  color: string;
  count: number;
  intensity: number;
}

export class ParticleSystem {
  private particles: Particle[] = [];
  private readonly maxParticles = 450;

  clear() {
    this.particles = [];
  }

  spawnBurst(options: ParticleBurstOptions) {
    const { center, origin, ringRadius, color, count, intensity } = options;
    if (count <= 0) return;

    const baseAngle = Math.atan2(origin.y - center.y, origin.x - center.x);
    const cappedCount = Math.min(150, count);
    for (let i = 0; i < cappedCount; i += 1) {
      const spread = (Math.random() - 0.5) * 0.9;
      const orbitSpeed = (0.7 + Math.random() * 0.8) * intensity;
      const wobbleAmp = ringRadius * 0.02 * (0.6 + Math.random() * 0.8) * intensity;
      const wobbleSpeed = 2 + Math.random() * 3;
      const life = 1.1 + Math.random() * 0.9 + intensity * 0.1;

      this.particles.push({
        cx: center.x,
        cy: center.y,
        angle: baseAngle + spread,
        radius: ringRadius * (0.65 + Math.random() * 0.1),
        targetRadius: ringRadius * (0.9 + Math.random() * 0.35 + intensity * 0.05),
        orbitSpeed,
        radialEase: 4 + Math.random() * 2,
        wobblePhase: Math.random() * Math.PI * 2,
        wobbleSpeed,
        wobbleAmplitude: wobbleAmp,
        size: (3 + Math.random() * 2) * intensity,
        color,
        baseAlpha: 0.75 + Math.random() * 0.2,
        life,
        age: 0
      });
    }

    if (this.particles.length > this.maxParticles) {
      this.particles.splice(0, this.particles.length - this.maxParticles);
    }
  }

  update(dt: number) {
    for (let i = this.particles.length - 1; i >= 0; i -= 1) {
      const p = this.particles[i];
      p.age += dt;
      if (p.age >= p.life) {
        this.particles.splice(i, 1);
        continue;
      }

      const t = p.age / p.life;
      const fade = 1 - t;
      const easeFactor = Math.min(1, dt * p.radialEase);
      p.radius += (p.targetRadius - p.radius) * easeFactor;
      p.angle += p.orbitSpeed * dt;
      p.size *= 0.998 + fade * 0.001;
      p.baseAlpha *= 0.99 + fade * 0.01;
    }
  }

  draw(ctx: CanvasRenderingContext2D) {
    if (this.particles.length === 0) return;

    ctx.save();
    this.particles.forEach((p) => {
      const t = p.age / p.life;
      const alpha = Math.max(0, p.baseAlpha * (1 - t * t));
      if (alpha <= 0.01) return;

      const wobble = Math.sin(p.wobblePhase + p.age * p.wobbleSpeed) * p.wobbleAmplitude;
      const radius = p.radius + wobble;
      const x = p.cx + Math.cos(p.angle) * radius;
      const y = p.cy + Math.sin(p.angle) * radius;

      const size = Math.max(1.2, p.size * (1 - t * 0.4));
      const gradient = ctx.createRadialGradient(x, y, size * 0.1, x, y, size);
      gradient.addColorStop(0, 'rgba(255,255,255,0.9)');
      gradient.addColorStop(0.35, `${p.color}`);
      gradient.addColorStop(1, 'rgba(0,0,0,0)');

      ctx.globalAlpha = alpha;
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(x, y, size, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.restore();
  }
}
