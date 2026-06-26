import type { VisualizerFrame, VisualizerMode, VisualizerRenderContext } from '../types';

/** Oscilloscope-style waveform renderer. */
export class Waveform implements VisualizerMode {
  readonly id = 'waveform';

  /** Draws the smoothed time-domain waveform. */
  render(frame: VisualizerFrame, { context2d, viewport, profile }: VisualizerRenderContext): void {
    const samples = frame.waveform.length;
    const centerY = viewport.height * (0.5 + (frame.mid - 0.5) * 0.08);
    const amplitude = viewport.height * (0.22 + frame.peak * 0.12);

    context2d.save();
    context2d.globalCompositeOperation = 'lighter';
    context2d.lineWidth = profile.id === 'balanced' ? 1.6 : 2.2;
    context2d.strokeStyle = `rgba(143, 166, 255, ${0.5 + frame.treble * 0.35})`;
    if (profile.allowGlow) {
      context2d.shadowBlur = 18;
      context2d.shadowColor = 'rgba(143, 166, 255, 0.55)';
    }
    context2d.beginPath();

    for (let index = 0; index < samples; index += 1) {
      const x = (index / Math.max(1, samples - 1)) * viewport.width;
      const y = centerY + frame.waveform[index] * amplitude;
      if (index === 0) {
        context2d.moveTo(x, y);
      } else {
        context2d.lineTo(x, y);
      }
    }

    context2d.stroke();
    context2d.restore();
  }

  /** Releases mode resources. */
  dispose(): void {}
}
