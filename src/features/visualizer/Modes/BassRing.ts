import type { VisualizerFrame, VisualizerMode, VisualizerRenderContext } from '../types';

/** Bass-reactive ring layer. */
export class BassRing implements VisualizerMode {
  readonly id = 'bassRing';
  private pulse = 0;

  /** Draws expanding rings driven by low-frequency energy. */
  render(frame: VisualizerFrame, { context2d, viewport, profile }: VisualizerRenderContext): void {
    this.pulse = this.pulse * 0.88 + frame.bass * 0.12;
    const radius = Math.min(viewport.width, viewport.height) * (0.28 + this.pulse * 0.16);
    const lineWidth = 2 + this.pulse * (profile.allowGlow ? 14 : 7);

    context2d.save();
    context2d.globalCompositeOperation = 'lighter';
    context2d.lineWidth = lineWidth;
    context2d.strokeStyle = `rgba(124, 247, 212, ${0.2 + this.pulse * 0.55})`;
    if (profile.allowGlow) {
      context2d.shadowBlur = 24 + this.pulse * 36;
      context2d.shadowColor = 'rgba(124, 247, 212, 0.72)';
    }
    context2d.beginPath();
    context2d.arc(viewport.width / 2, viewport.height / 2, radius, 0, Math.PI * 2);
    context2d.stroke();
    context2d.restore();
  }

  /** Releases mode resources. */
  dispose(): void {}
}
