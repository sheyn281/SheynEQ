import type { AnalyzerFrame } from './types';

const BYTE_CENTER = 128;
const BYTE_SCALE = 128;

/** Reads analyser node data and derives production audio metering values. */
export class AudioAnalyzer {
  private readonly fftData: Uint8Array<ArrayBuffer>;
  private readonly timeDomainData: Uint8Array<ArrayBuffer>;

  /** Creates an analyzer reader for a Web Audio analyser node. */
  constructor(
    private readonly analyser: AnalyserNode,
    private readonly sampleRate: number
  ) {
    this.fftData = new Uint8Array(this.analyser.frequencyBinCount);
    this.timeDomainData = new Uint8Array(this.analyser.fftSize);
  }

  /** Captures the latest FFT, waveform, and derived energy values. */
  captureFrame(): AnalyzerFrame {
    this.analyser.getByteFrequencyData(this.fftData);
    this.analyser.getByteTimeDomainData(this.timeDomainData);

    return {
      fft: new Uint8Array(this.fftData),
      timeDomain: new Uint8Array(this.timeDomainData),
      rms: this.calculateRms(),
      peak: this.calculatePeak(),
      bassEnergy: this.calculateBandEnergy(20, 250),
      midEnergy: this.calculateBandEnergy(250, 4000),
      trebleEnergy: this.calculateBandEnergy(4000, 20000)
    };
  }

  private calculateRms(): number {
    const sumSquares = this.timeDomainData.reduce((total, value) => {
      const normalized = (value - BYTE_CENTER) / BYTE_SCALE;
      return total + normalized * normalized;
    }, 0);

    return Math.sqrt(sumSquares / this.timeDomainData.length);
  }

  private calculatePeak(): number {
    return this.timeDomainData.reduce((peak, value) => {
      const normalized = Math.abs((value - BYTE_CENTER) / BYTE_SCALE);
      return Math.max(peak, normalized);
    }, 0);
  }

  private calculateBandEnergy(minFrequency: number, maxFrequency: number): number {
    const nyquist = this.sampleRate / 2;
    const startIndex = Math.max(0, Math.floor((minFrequency / nyquist) * this.fftData.length));
    const endIndex = Math.min(this.fftData.length - 1, Math.ceil((maxFrequency / nyquist) * this.fftData.length));

    if (endIndex < startIndex) {
      return 0;
    }

    let total = 0;
    let count = 0;

    for (let index = startIndex; index <= endIndex; index += 1) {
      total += this.fftData[index] / 255;
      count += 1;
    }

    return count > 0 ? total / count : 0;
  }
}
