import type { VisualizerFrame, VisualizerMode, VisualizerRenderContext } from '../types';

interface Star {
  angle: number;
  radius: number;
  speed: number;
  size: number;
}

/** Rotating galaxy field using bounded deterministic stars. */
export class Galaxy implements VisualizerMode {
  readonly id = 'galaxy';
  private stars: Star[] = [];
  private starCount = 0;

  /** Draws a galaxy layer that responds to RMS and bass energy. */
  render(frame: VisualizerFrame, { context2d, viewport, profile }: VisualizerRenderContext): void {
    if (!profile.allowAdvancedModes) {
      return;
    }

    const desiredCount = profile.id === 'extreme' ? 260 : 120;
    this.ensureStars(desiredCount);
    const centerX = viewport.width / 2;
    const centerY = viewport.height / 2;
    const maxRadius = Math.min(viewport.width, viewport.height) * (0.16 + frame.bass * 0.22);
    const rotation = frame.timestamp * 0.00008 * (1 + frame.rms * 4);

    context2d.save();
    context2d.globalCompositeOperation = 'lighter';

    for (let index = 0; index < this.stars.length; index += 1) {
      const star = this.stars[index];
      const angle = star.angle + rotation * star.speed;
      const radius = star.radius * maxRadius * (1 + frame.peak * 0.18);
      const x = centerX + Math.cos(angle) * radius;
      const y = centerY + Math.sin(angle) * radius * 0.68;
      const alpha = 0.16 + frame.treble * 0.42 + (1 - star.radius) * 0.16;

      context2d.fillStyle = `rgba(247, 184, 75, ${alpha})`;
      context2d.fillRect(x, y, star.size, star.size);
    }

    context2d.restore();
  }

  /** Clears retained star state. */
  dispose(): void {
    this.stars = [];
    this.starCount = 0;
  }

  private ensureStars(count: number): void {
    if (this.starCount === count) {
      return;
    }

    this.stars = [];
    for (let index = 0; index < count; index += 1) {
      const normalized = index / count;
      const radius = Math.sqrt(this.noise(index, 4));
      this.stars.push({
        angle: normalized * Math.PI * 2 * 3.2 + this.noise(index, 1),
        radius,
        speed: 0.45 + this.noise(index, 2) * 1.6,
        size: 0.8 + this.noise(index, 3) * 1.8
      });
    }
    this.starCount = count;
  }

  private noise(index: number, salt: number): number {
    const value = Math.sin((index + 1) * (salt + 3) * 78.233) * 43758.5453;
    return value - Math.floor(value);
  }
}
