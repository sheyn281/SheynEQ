import type { VisualizerFrame, VisualizerMode, VisualizerRenderContext } from '../types';

/** Radial spectrum renderer for balanced and higher profiles. */
export class CircularSpectrum implements VisualizerMode {
  readonly id = 'circularSpectrum';

  /** Draws FFT magnitude around a circular center line. */
  render(frame: VisualizerFrame, { context2d, viewport, profile }: VisualizerRenderContext): void {
    const width = viewport.width;
    const height = viewport.height;
    const centerX = width / 2;
    const centerY = height / 2;
    const radius = Math.min(width, height) * (0.22 + frame.rms * 0.08);
    const count = Math.min(profile.id === 'balanced' ? 96 : 180, frame.spectrum.length);

    context2d.save();
    context2d.translate(centerX, centerY);
    context2d.globalCompositeOperation = 'lighter';
    context2d.lineWidth = profile.id === 'balanced' ? 1.4 : 1.8;

    for (let index = 0; index < count; index += 1) {
      const energy = frame.spectrum[index];
      const angle = (index / count) * Math.PI * 2 - Math.PI / 2;
      const inner = radius;
      const outer = radius + energy * Math.min(width, height) * 0.24;
      const x1 = Math.cos(angle) * inner;
      const y1 = Math.sin(angle) * inner;
      const x2 = Math.cos(angle) * outer;
      const y2 = Math.sin(angle) * outer;

      context2d.strokeStyle = `hsla(${185 + energy * 70}, 92%, ${55 + energy * 18}%, ${0.28 + energy * 0.62})`;
      context2d.beginPath();
      context2d.moveTo(x1, y1);
      context2d.lineTo(x2, y2);
      context2d.stroke();
    }

    context2d.restore();
  }

  /** Releases mode resources. */
  dispose(): void {}
}
