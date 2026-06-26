import type { AudioCoreSettings, EqualizerBandFrequency, EqualizerSettings } from './types';

/** Ordered center frequencies for the production 10-band equalizer. */
export const EQUALIZER_BANDS: readonly EqualizerBandFrequency[] = [
  32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000
] as const;

/** Minimum allowed equalizer gain in decibels. */
export const MIN_EQ_GAIN_DB = -12;

/** Maximum allowed equalizer gain in decibels. */
export const MAX_EQ_GAIN_DB = 12;

/** Storage key for persisted audio core settings. */
export const AUDIO_CORE_STORAGE_KEY = 'sheynfx.audioCore.v1';

/** Creates a flat 10-band equalizer setting object. */
export function createFlatEqualizerSettings(): EqualizerSettings {
  return EQUALIZER_BANDS.reduce<EqualizerSettings>((settings, frequency) => {
    settings[frequency] = 0;
    return settings;
  }, {} as EqualizerSettings);
}

/** Default audio core settings used when no persisted settings exist. */
export const DEFAULT_AUDIO_CORE_SETTINGS: AudioCoreSettings = {
  masterGain: 1,
  pan: 0,
  equalizer: createFlatEqualizerSettings(),
  presetName: 'Flat'
};
