/** Runtime state reported by the browser audio context and engine facade. */
export type AudioEngineStatus = 'idle' | 'running' | 'suspended' | 'unsupported' | 'disposed';

/** Supported equalizer center frequencies in hertz. */
export type EqualizerBandFrequency =
  | 32
  | 64
  | 125
  | 250
  | 500
  | 1000
  | 2000
  | 4000
  | 8000
  | 16000;

/** A single equalizer band setting. */
export interface EqualizerBandSetting {
  /** Center frequency in hertz. */
  frequency: EqualizerBandFrequency;
  /** Gain in decibels, clamped from -12 dB to +12 dB. */
  gainDb: number;
}

/** Serializable 10-band equalizer state. */
export type EqualizerSettings = Record<EqualizerBandFrequency, number>;

/** Analyzer frame containing raw arrays and derived level metrics. */
export interface AnalyzerFrame {
  /** Frequency-domain byte data from the analyser node. */
  fft: Uint8Array<ArrayBuffer>;
  /** Time-domain byte data from the analyser node. */
  timeDomain: Uint8Array<ArrayBuffer>;
  /** Root mean square level normalized from 0 to 1. */
  rms: number;
  /** Peak sample level normalized from 0 to 1. */
  peak: number;
  /** Average low-frequency energy normalized from 0 to 1. */
  bassEnergy: number;
  /** Average mid-frequency energy normalized from 0 to 1. */
  midEnergy: number;
  /** Average high-frequency energy normalized from 0 to 1. */
  trebleEnergy: number;
}

/** Core audio graph settings that can be persisted and restored. */
export interface AudioCoreSettings {
  /** Master output gain from 0 to 1. */
  masterGain: number;
  /** Stereo pan from -1 left to +1 right. */
  pan: number;
  /** Equalizer gain values by band frequency. */
  equalizer: EqualizerSettings;
  /** Selected built-in preset name. */
  presetName: PresetName;
}

/** Immutable built-in preset definition. */
export interface EqualizerPreset {
  /** Human-readable preset name. */
  name: PresetName;
  /** Equalizer gain values by band frequency. */
  equalizer: EqualizerSettings;
}

/** Names of the built-in equalizer presets. */
export type PresetName = 'Flat' | 'Bass Boost' | 'Rock' | 'Pop' | 'EDM' | 'Classical';

/** Minimal Web Audio constructor surface used by the context manager. */
export type AudioContextConstructor = new (contextOptions?: AudioContextOptions) => AudioContext;

/** Factory used to create browser audio contexts in production or tests. */
export type AudioContextFactory = () => AudioContext;
