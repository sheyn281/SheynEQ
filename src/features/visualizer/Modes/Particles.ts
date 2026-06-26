import type { VisualizerFrame, VisualizerMode, VisualizerRenderContext } from '../types';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  size: number;
  hue: number;
}

/** Audio-reactive particle field for Quality and Extreme profiles. */
export class Particles implements VisualizerMode {
  readonly id = 'particles';
  private readonly particles: Particle[] = [];

  /** Emits and draws bounded particles from audio transients. */
  render(frame: VisualizerFrame, { context2d, viewport, profile }: VisualizerRenderContext): void {
    if (!profile.allowParticles) {
      return;
    }

    const maxParticles = profile.id === 'extreme' ? 220 : 90;
    const emitCount = Math.min(10, Math.floor(frame.peak * (profile.id === 'extreme' ? 12 : 5)));

    for (let index = 0; index < emitCount && this.particles.length < maxParticles; index += 1) {
      const angle = (frame.timestamp * 0.001 + index / Math.max(1, emitCount)) * Math.PI * 2;
      const speed = 24 + frame.treble * 180 + index * 3;
      this.particles.push({
        x: viewport.width / 2,
        y: viewport.height / 2,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1,
        size: 1.5 + frame.peak * 4,
        hue: 170 + frame.mid * 90 + index * 8
      });
    }

    context2d.save();
    context2d.globalCompositeOperation = 'lighter';

    for (let index = this.particles.length - 1; index >= 0; index -= 1) {
      const particle = this.particles[index];
      particle.life -= frame.deltaSeconds * (0.55 + frame.treble * 0.35);
      particle.x += particle.vx * frame.deltaSeconds;
      particle.y += particle.vy * frame.deltaSeconds;
      particle.vx *= 0.992;
      particle.vy *= 0.992;

      if (particle.life <= 0) {
        this.particles.splice(index, 1);
        continue;
      }

      const alpha = particle.life * (0.24 + frame.peak * 0.42);
      context2d.fillStyle = `hsla(${particle.hue}, 94%, 64%, ${alpha})`;
      context2d.beginPath();
      context2d.arc(particle.x, particle.y, particle.size * particle.life, 0, Math.PI * 2);
      context2d.fill();
    }

    context2d.restore();
  }

  /** Clears retained particle state. */
  dispose(): void {
    this.particles.length = 0;
  }
}
