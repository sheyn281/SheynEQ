import type { VisualizerFrame, VisualizerMode, VisualizerRenderContext } from '../types';

/** Low-cost frequency bar renderer for all performance profiles. */
export class SpectrumBars implements VisualizerMode {
  readonly id = 'spectrumBars';

  /** Draws vertical FFT bars with bass/mid/treble color response. */
  render(frame: VisualizerFrame, { context2d, viewport, profile }: VisualizerRenderContext): void {
    const binCount = Math.min(frame.spectrum.length, profile.fftBinLimit);
    const barCount = profile.id === 'ultraPerformance' ? Math.min(32, binCount) : Math.min(96, binCount);
    const width = viewport.width;
    const height = viewport.height;
    const gap = profile.id === 'ultraPerformance' ? 2 : 1;
    const barWidth = Math.max(1, width / barCount - gap);

    context2d.save();
    context2d.globalCompositeOperation = 'lighter';

    for (let index = 0; index < barCount; index += 1) {
      const sourceIndex = Math.floor((index / barCount) * binCount);
      const energy = frame.spectrum[sourceIndex];
      const barHeight = Math.max(2, energy * height * 0.86);
      const x = index * (barWidth + gap);
      const y = height - barHeight;
      const hue = 166 + (index / barCount) * 58 + frame.treble * 24;

      context2d.fillStyle = `hsla(${hue}, 88%, ${54 + frame.mid * 18}%, ${0.72 + frame.peak * 0.22})`;
      context2d.fillRect(x, y, barWidth, barHeight);
    }

    context2d.restore();
  }

  /** Releases mode resources. */
  dispose(): void {}
}
