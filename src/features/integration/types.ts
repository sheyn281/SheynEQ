import type { AudioCoreSettings, EqualizerBandFrequency } from '../audio/types';
import type { EffectId, EffectParametersMap, EffectsSettings, NightcoreSettings, PitchSettings, SlowedReverbSettings, SpeedSettings } from '../audio/effects';

/** Popup theme selection. */
export type SheynFxTheme = 'dark' | 'light';

/** Collapsible popup section ids. */
export type SheynFxSectionId = 'equalizer' | 'effects';

/** Equalizer popup display mode. */
export type SheynFxEqMode = 'sliders' | 'curve';

/** Persisted popup UX preferences. */
export interface SheynFxPopupSettings {
  /** Active popup theme. */
  theme: SheynFxTheme;
  /** Collapsed state by section id. */
  collapsedSections: Record<SheynFxSectionId, boolean>;
  /** Active equalizer display mode. */
  eqMode: SheynFxEqMode;
}

/** Serializable analyzer frame for extension messaging. */
export interface SerializableAnalyzerFrame {
  /** Frequency-domain byte data. */
  fft: number[];
  /** Time-domain byte data. */
  timeDomain: number[];
  /** Root mean square level normalized from 0 to 1. */
  rms: number;
  /** Peak level normalized from 0 to 1. */
  peak: number;
  /** Bass energy normalized from 0 to 1. */
  bassEnergy: number;
  /** Mid energy normalized from 0 to 1. */
  midEnergy: number;
  /** Treble energy normalized from 0 to 1. */
  trebleEnergy: number;
}

/** Persisted settings for the first playable SheynEQ alpha. */
export interface SheynFxAlphaSettings {
  /** Master extension processing enable state. */
  enabled: boolean;
  /** Core audio graph settings. */
  audio: AudioCoreSettings;
  /** Effects engine settings. */
  effects: EffectsSettings;
  /** Popup UX settings. */
  popup: SheynFxPopupSettings;
}

/** Runtime status reported by the active tab content script. */
export interface SheynFxTabStatus {
  /** Number of detected media elements. */
  detectedMediaCount: number;
  /** Number of currently attached media elements. */
  attachedMediaCount: number;
  /** Whether processing is enabled in the tab. */
  enabled: boolean;
  /** Latest output level from analyzer peak/RMS. */
  outputLevel: number;
  /** Clear status message for the active tab. */
  message: string;
  /** Latest analyzer frame for popup metering. */
  analyzerFrame: SerializableAnalyzerFrame;
}

/** Type-safe effect update command variants. */
export type SheynFxEffectUpdateCommand = {
  [Key in EffectId]: {
    type: 'SHEYNFX_UPDATE_EFFECT';
    effectId: Key;
    parameters: Partial<EffectParametersMap[Key]>;
  };
}[EffectId];

/** Messages sent from popup to content script. */
export type SheynFxCommand =
  | { type: 'SHEYNFX_GET_STATUS' }
  | { type: 'SHEYNFX_APPLY_SETTINGS'; settings: SheynFxAlphaSettings }
  | { type: 'SHEYNFX_SET_ENABLED'; enabled: boolean }
  | { type: 'SHEYNFX_SET_EQ_BAND'; frequency: EqualizerBandFrequency; gainDb: number }
  | { type: 'SHEYNFX_SET_BASS_BOOST'; enabled: boolean; amount: number }
  | { type: 'SHEYNFX_UPDATE_SLOWED_REVERB'; parameters: Partial<SlowedReverbSettings> }
  | { type: 'SHEYNFX_UPDATE_NIGHTCORE'; parameters: Partial<NightcoreSettings> }
  | { type: 'SHEYNFX_UPDATE_SPEED'; parameters: Partial<SpeedSettings> }
  | { type: 'SHEYNFX_UPDATE_PITCH'; parameters: Partial<PitchSettings> }
  | SheynFxEffectUpdateCommand;

/** Response returned by the content script. */
export interface SheynFxCommandResponse {
  /** Whether the command succeeded. */
  ok: boolean;
  /** Optional status after command processing. */
  status?: SheynFxTabStatus;
  /** Optional error message. */
  error?: string;
}

/** Storage key for alpha settings. */
export const SHEYNFX_ALPHA_SETTINGS_KEY = 'sheynfx.alpha.v1';
