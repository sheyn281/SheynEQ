import type { AnalyzerFrame } from '../audio/types';
import type {
  VisualizerFrame,
  VisualizerModeId,
  VisualizerPerformanceProfile,
  VisualizerProfileSettings
} from './types';

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** Built-in rendering profiles for CPU/GPU adaptive behavior. */
export const VISUALIZER_PROFILES: Record<VisualizerPerformanceProfile, VisualizerProfileSettings> = {
  ultraPerformance: {
    id: 'ultraPerformance',
    label: 'Ultra Performance',
    targetFps: 15,
    analyzerRefreshInterval: 4,
    maxDevicePixelRatio: 1,
    allowGlow: false,
    allowParticles: false,
    allowAdvancedModes: false,
    preferredBackend: 'canvas2d',
    fftBinLimit: 64
  },
  balanced: {
    id: 'balanced',
    label: 'Balanced',
    targetFps: 30,
    analyzerRefreshInterval: 2,
    maxDevicePixelRatio: 1.5,
    allowGlow: false,
    allowParticles: false,
    allowAdvancedModes: true,
    preferredBackend: 'canvas2d',
    fftBinLimit: 128
  },
  quality: {
    id: 'quality',
    label: 'Quality',
    targetFps: 60,
    analyzerRefreshInterval: 1,
    maxDevicePixelRatio: 2,
    allowGlow: true,
    allowParticles: true,
    allowAdvancedModes: true,
    preferredBackend: 'canvas2d',
    fftBinLimit: 192
  },
  extreme: {
    id: 'extreme',
    label: 'Extreme',
    targetFps: 60,
    analyzerRefreshInterval: 1,
    maxDevicePixelRatio: 3,
    allowGlow: true,
    allowParticles: true,
    allowAdvancedModes: true,
    preferredBackend: 'webgl',
    fftBinLimit: 256
  }
};

const MODE_MINIMUM_PROFILE: Record<VisualizerModeId, VisualizerPerformanceProfile> = {
  spectrumBars: 'ultraPerformance',
  circularSpectrum: 'balanced',
  bassRing: 'balanced',
  particles: 'quality',
  aurora: 'quality',
  galaxy: 'quality',
  waveform: 'balanced'
};

const PROFILE_RANK: Record<VisualizerPerformanceProfile, number> = {
  ultraPerformance: 0,
  balanced: 1,
  quality: 2,
  extreme: 3
};

/** Adapts visualizer quality, smoothing, and sensitivity from profile and frame cost. */
export class PerformanceController {
  private profile: VisualizerProfileSettings;
  private smoothedSpectrum = new Float32Array(0);
  private smoothedWaveform = new Float32Array(0);
  private rms = 0;
  private peak = 0;
  private bass = 0;
  private mid = 0;
  private treble = 0;
  private sensitivity = 1.25;
  private averageFrameMs = 0;

  /** Creates a performance controller for the selected profile. */
  constructor(profile: VisualizerPerformanceProfile = 'balanced') {
    this.profile = VISUALIZER_PROFILES[profile];
  }

  /** Switches profile at runtime without requiring renderer restart. */
  setProfile(profile: VisualizerPerformanceProfile): void {
    this.profile = VISUALIZER_PROFILES[profile];
  }

  /** Returns the active profile settings. */
  getProfile(): VisualizerProfileSettings {
    return this.profile;
  }

  /** Returns mode ids supported by the active profile in the requested order. */
  filterModes(modes: readonly VisualizerModeId[]): VisualizerModeId[] {
    return modes.filter((mode) => PROFILE_RANK[this.profile.id] >= PROFILE_RANK[MODE_MINIMUM_PROFILE[mode]]);
  }

  /** Records render cost and automatically lowers expensive quality knobs. */
  recordFrameCost(frameMs: number): void {
    this.averageFrameMs = this.averageFrameMs === 0 ? frameMs : this.averageFrameMs * 0.92 + frameMs * 0.08;

    if (this.averageFrameMs > 1000 / this.profile.targetFps * 1.35 && this.profile.id !== 'ultraPerformance') {
      const nextProfile: Record<VisualizerPerformanceProfile, VisualizerPerformanceProfile> = {
        extreme: 'quality',
        quality: 'balanced',
        balanced: 'ultraPerformance',
        ultraPerformance: 'ultraPerformance'
      };
      this.setProfile(nextProfile[this.profile.id]);
    }
  }

  /** Converts analyzer output into an adaptive smoothed visualizer frame. */
  createFrame(analyzer: AnalyzerFrame, timestamp: number, deltaSeconds: number): VisualizerFrame {
    const fftLength = Math.min(analyzer.fft.length, this.profile.fftBinLimit);
    const waveformLength = Math.min(analyzer.timeDomain.length, this.profile.fftBinLimit * 2);

    this.ensureBuffers(fftLength, waveformLength);
    this.updateSensitivity(analyzer);

    const smoothing = this.getAdaptiveSmoothing(analyzer);
    for (let index = 0; index < fftLength; index += 1) {
      const normalized = clamp((analyzer.fft[index] / 255) * this.sensitivity, 0, 1);
      this.smoothedSpectrum[index] = this.smoothedSpectrum[index] * smoothing + normalized * (1 - smoothing);
    }

    const waveformStep = Math.max(1, Math.floor(analyzer.timeDomain.length / waveformLength));
    for (let index = 0; index < waveformLength; index += 1) {
      const sourceIndex = Math.min(analyzer.timeDomain.length - 1, index * waveformStep);
      const normalized = (analyzer.timeDomain[sourceIndex] - 128) / 128;
      this.smoothedWaveform[index] = this.smoothedWaveform[index] * smoothing + normalized * (1 - smoothing);
    }

    this.rms = this.smoothScalar(this.rms, analyzer.rms, smoothing);
    this.peak = this.smoothScalar(this.peak, analyzer.peak, smoothing * 0.82);
    this.bass = this.smoothScalar(this.bass, analyzer.bassEnergy, smoothing);
    this.mid = this.smoothScalar(this.mid, analyzer.midEnergy, smoothing);
    this.treble = this.smoothScalar(this.treble, analyzer.trebleEnergy, smoothing);

    return {
      analyzer,
      spectrum: this.smoothedSpectrum,
      waveform: this.smoothedWaveform,
      rms: clamp(this.rms * this.sensitivity, 0, 1),
      peak: clamp(this.peak * this.sensitivity, 0, 1),
      bass: clamp(this.bass * this.sensitivity, 0, 1),
      mid: clamp(this.mid * this.sensitivity, 0, 1),
      treble: clamp(this.treble * this.sensitivity, 0, 1),
      sensitivity: this.sensitivity,
      deltaSeconds,
      timestamp
    };
  }

  private ensureBuffers(fftLength: number, waveformLength: number): void {
    if (this.smoothedSpectrum.length !== fftLength) {
      this.smoothedSpectrum = new Float32Array(fftLength);
    }

    if (this.smoothedWaveform.length !== waveformLength) {
      this.smoothedWaveform = new Float32Array(waveformLength);
    }
  }

  private updateSensitivity(analyzer: AnalyzerFrame): void {
    const energy = Math.max(0.02, analyzer.rms * 0.6 + analyzer.peak * 0.2 + analyzer.bassEnergy * 0.2);
    const target = clamp(0.38 / energy, 0.85, 2.4);
    this.sensitivity = this.sensitivity * 0.97 + target * 0.03;
  }

  private getAdaptiveSmoothing(analyzer: AnalyzerFrame): number {
    const energy = analyzer.rms + analyzer.peak + analyzer.bassEnergy;
    const base = this.profile.targetFps >= 60 ? 0.72 : 0.84;
    return clamp(base - energy * 0.16, 0.48, 0.9);
  }

  private smoothScalar(current: number, next: number, smoothing: number): number {
    return current * smoothing + next * (1 - smoothing);
  }
}
