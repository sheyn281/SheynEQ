import type { VisualizerFrame, VisualizerMode, VisualizerRenderContext } from '../types';

/** Flowing aurora layer driven by mid and treble energy. */
export class Aurora implements VisualizerMode {
  readonly id = 'aurora';

  /** Draws layered sine ribbons with audio-reactive color and amplitude. */
  render(frame: VisualizerFrame, { context2d, viewport, profile }: VisualizerRenderContext): void {
    if (!profile.allowAdvancedModes) {
      return;
    }

    const layers = profile.id === 'extreme' ? 5 : 3;
    const time = frame.timestamp * 0.00045;

    context2d.save();
    context2d.globalCompositeOperation = 'screen';
    if (profile.allowGlow) {
      context2d.shadowBlur = profile.id === 'extreme' ? 28 : 16;
      context2d.shadowColor = 'rgba(124, 247, 212, 0.4)';
    }

    for (let layer = 0; layer < layers; layer += 1) {
      const yBase = viewport.height * (0.25 + layer * 0.13);
      const amplitude = viewport.height * (0.035 + frame.mid * 0.08 + layer * 0.006);
      const hue = 150 + layer * 24 + frame.treble * 36;
      const gradient = context2d.createLinearGradient(0, yBase - amplitude * 2, viewport.width, yBase + amplitude * 2);
      gradient.addColorStop(0, `hsla(${hue}, 90%, 58%, 0)`);
      gradient.addColorStop(0.5, `hsla(${hue + 22}, 94%, 62%, ${0.12 + frame.mid * 0.18})`);
      gradient.addColorStop(1, `hsla(${hue + 48}, 88%, 58%, 0)`);

      context2d.strokeStyle = gradient;
      context2d.lineWidth = 10 + layer * 4 + frame.rms * 18;
      context2d.beginPath();

      for (let x = 0; x <= viewport.width; x += 8) {
        const phase = x * 0.012 + time * (1.2 + layer * 0.2) + layer;
        const y = yBase + Math.sin(phase) * amplitude + Math.sin(phase * 0.41) * amplitude * 0.6;
        if (x === 0) {
          context2d.moveTo(x, y);
        } else {
          context2d.lineTo(x, y);
        }
      }

      context2d.stroke();
    }

    context2d.restore();
  }

  /** Releases mode resources. */
  dispose(): void {}
}
