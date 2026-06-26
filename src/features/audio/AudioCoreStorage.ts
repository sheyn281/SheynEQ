import { localStorageArea } from '../../shared/browser/storage';
import type { LocalStorageArea } from '../../shared/browser/storage';
import { AUDIO_CORE_STORAGE_KEY, DEFAULT_AUDIO_CORE_SETTINGS, EQUALIZER_BANDS } from './constants';
import type { AudioCoreSettings, EqualizerSettings, PresetName } from './types';

const PRESET_NAMES: readonly PresetName[] = ['Flat', 'Bass Boost', 'Rock', 'Pop', 'EDM', 'Classical'] as const;

/** Persists and restores audio core settings with Chrome storage. */
export class AudioCoreStorage {
  /** Creates a storage adapter for audio core settings. */
  constructor(
    private readonly storageKey = AUDIO_CORE_STORAGE_KEY,
    private readonly storage: LocalStorageArea = localStorageArea
  ) {}

  /** Loads sanitized settings from storage, falling back to defaults. */
  async load(): Promise<AudioCoreSettings> {
    const storedSettings = await this.storage.get<Partial<AudioCoreSettings>>(this.storageKey);
    return this.sanitize(storedSettings);
  }

  /** Saves sanitized audio core settings to storage. */
  async save(settings: AudioCoreSettings): Promise<void> {
    await this.storage.set(this.storageKey, this.sanitize(settings));
  }

  private sanitize(settings: Partial<AudioCoreSettings> | undefined): AudioCoreSettings {
    return {
      masterGain: this.clampNumber(settings?.masterGain, 0, 1, DEFAULT_AUDIO_CORE_SETTINGS.masterGain),
      pan: this.clampNumber(settings?.pan, -1, 1, DEFAULT_AUDIO_CORE_SETTINGS.pan),
      equalizer: this.sanitizeEqualizer(settings?.equalizer),
      presetName: this.sanitizePresetName(settings?.presetName)
    };
  }

  private sanitizeEqualizer(settings: Partial<EqualizerSettings> | undefined): EqualizerSettings {
    const equalizer = { ...DEFAULT_AUDIO_CORE_SETTINGS.equalizer };

    EQUALIZER_BANDS.forEach((frequency) => {
      equalizer[frequency] = this.clampNumber(settings?.[frequency], -12, 12, 0);
    });

    return equalizer;
  }

  private sanitizePresetName(presetName: PresetName | undefined): PresetName {
    return presetName && PRESET_NAMES.includes(presetName) ? presetName : DEFAULT_AUDIO_CORE_SETTINGS.presetName;
  }

  private clampNumber(value: number | undefined, min: number, max: number, fallback: number): number {
    if (typeof value !== 'number' || Number.isNaN(value)) {
      return fallback;
    }

    return Math.min(Math.max(value, min), max);
  }
}
