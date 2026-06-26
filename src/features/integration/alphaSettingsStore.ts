import { localStorageArea } from '../../shared/browser/storage';
import { DEFAULT_ALPHA_SETTINGS } from './defaults';
import { SHEYNFX_ALPHA_SETTINGS_KEY, type SheynFxAlphaSettings } from './types';

/** Loads persisted alpha settings. */
export async function loadAlphaSettings(): Promise<SheynFxAlphaSettings> {
  const settings = await localStorageArea.get<Partial<SheynFxAlphaSettings>>(SHEYNFX_ALPHA_SETTINGS_KEY);
  return sanitizeAlphaSettings(settings);
}

/** Persists alpha settings. */
export async function saveAlphaSettings(settings: SheynFxAlphaSettings): Promise<void> {
  await localStorageArea.set(SHEYNFX_ALPHA_SETTINGS_KEY, sanitizeAlphaSettings(settings));
}

/** Sanitizes partial alpha settings with production defaults. */
export function sanitizeAlphaSettings(settings: Partial<SheynFxAlphaSettings> | undefined): SheynFxAlphaSettings {
  return {
    enabled: settings?.enabled ?? DEFAULT_ALPHA_SETTINGS.enabled,
    audio: {
      ...DEFAULT_ALPHA_SETTINGS.audio,
      ...settings?.audio,
      equalizer: {
        ...DEFAULT_ALPHA_SETTINGS.audio.equalizer,
        ...settings?.audio?.equalizer
      }
    },
    effects: {
      bassBoost: { ...DEFAULT_ALPHA_SETTINGS.effects.bassBoost, ...settings?.effects?.bassBoost },
      reverb: { ...DEFAULT_ALPHA_SETTINGS.effects.reverb, ...settings?.effects?.reverb },
      slowedReverb: { ...DEFAULT_ALPHA_SETTINGS.effects.slowedReverb, ...settings?.effects?.slowedReverb },
      nightcore: { ...DEFAULT_ALPHA_SETTINGS.effects.nightcore, ...settings?.effects?.nightcore },
      speed: { ...DEFAULT_ALPHA_SETTINGS.effects.speed, ...settings?.effects?.speed },
      pitch: { ...DEFAULT_ALPHA_SETTINGS.effects.pitch, ...settings?.effects?.pitch }
    },
    popup: {
      ...DEFAULT_ALPHA_SETTINGS.popup,
      ...settings?.popup,
      collapsedSections: {
        ...DEFAULT_ALPHA_SETTINGS.popup.collapsedSections,
        ...settings?.popup?.collapsedSections
      }
    }
  };
}
