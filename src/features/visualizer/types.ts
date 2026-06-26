import type { AnalyzerFrame } from '../audio/types';

/** Built-in performance profile names for adaptive rendering. */
export type VisualizerPerformanceProfile = 'ultraPerformance' | 'balanced' | 'quality' | 'extreme';

/** Built-in visualizer mode identifiers. */
export type VisualizerModeId =
  | 'spectrumBars'
  | 'circularSpectrum'
  | 'bassRing'
  | 'particles'
  | 'aurora'
  | 'galaxy'
  | 'waveform';

/** Canvas rendering backend selected by the renderer. */
export type VisualizerBackend = 'canvas2d' | 'webgl';

/** Performance controls used by the scheduler and renderer. */
export interface VisualizerProfileSettings {
  /** Profile identifier. */
  id: VisualizerPerformanceProfile;
  /** Human-readable profile name. */
  label: string;
  /** Target render frames per second. */
  targetFps: number;
  /** Number of rendered frames between analyzer refreshes. */
  analyzerRefreshInterval: number;
  /** Maximum device pixel ratio used for canvas backing resolution. */
  maxDevicePixelRatio: number;
  /** Whether blur and glow effects are allowed. */
  allowGlow: boolean;
  /** Whether particle visualizers are allowed. */
  allowParticles: boolean;
  /** Whether all expensive visualizer modes are available. */
  allowAdvancedModes: boolean;
  /** Preferred renderer backend for the profile. */
  preferredBackend: VisualizerBackend;
  /** Maximum FFT bins consumed by modes. */
  fftBinLimit: number;
}

/** Renderer viewport in CSS and device pixels. */
export interface VisualizerViewport {
  /** CSS pixel width. */
  width: number;
  /** CSS pixel height. */
  height: number;
  /** Device pixel ratio applied to the backing canvas. */
  pixelRatio: number;
}

/** Smoothed and sensitivity-adjusted frame consumed by render modes. */
export interface VisualizerFrame {
  /** Raw analyzer frame from the audio engine. */
  analyzer: AnalyzerFrame;
  /** Smoothed FFT values normalized from 0 to 1. */
  spectrum: Float32Array;
  /** Smoothed waveform values normalized from -1 to 1. */
  waveform: Float32Array;
  /** Smoothed RMS level. */
  rms: number;
  /** Smoothed peak level. */
  peak: number;
  /** Smoothed bass energy. */
  bass: number;
  /** Smoothed mid energy. */
  mid: number;
  /** Smoothed treble energy. */
  treble: number;
  /** Adaptive sensitivity multiplier. */
  sensitivity: number;
  /** Seconds since the previous rendered frame. */
  deltaSeconds: number;
  /** Monotonic timestamp for animation. */
  timestamp: number;
}

/** Render mode draw context. */
export interface VisualizerRenderContext {
  /** Canvas2D context. */
  context2d: CanvasRenderingContext2D;
  /** Optional WebGL context when available and useful. */
  webgl: WebGLRenderingContext | null;
  /** Current viewport. */
  viewport: VisualizerViewport;
  /** Active performance profile. */
  profile: VisualizerProfileSettings;
}

/** Contract implemented by all visualizer modes. */
export interface VisualizerMode {
  /** Stable mode id. */
  readonly id: VisualizerModeId;
  /** Draws one animation frame. */
  render(frame: VisualizerFrame, renderContext: VisualizerRenderContext): void;
  /** Releases mode-owned resources. */
  dispose(): void;
}

/** Visualizer engine settings. */
export interface VisualizerSettings {
  /** Active performance profile. */
  profile: VisualizerPerformanceProfile;
  /** Active render modes in draw order. */
  modes: readonly VisualizerModeId[];
  /** Whether rendering is enabled. */
  enabled: boolean;
}

/** Provides analyzer frames to the visualizer engine. */
export type AnalyzerFrameProvider = () => AnalyzerFrame;

/** Callback invoked by the frame scheduler. */
export type ScheduledFrameCallback = (timestamp: number, deltaSeconds: number) => void;
