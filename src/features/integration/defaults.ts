import { DEFAULT_AUDIO_CORE_SETTINGS } from '../audio/constants';
import { DEFAULT_EFFECTS_SETTINGS } from '../audio/effects';
import type { SheynFxAlphaSettings } from './types';

/** Default first-alpha settings shared by popup and content script. */
export const DEFAULT_ALPHA_SETTINGS: SheynFxAlphaSettings = {
  enabled: false,
  audio: DEFAULT_AUDIO_CORE_SETTINGS,
  effects: DEFAULT_EFFECTS_SETTINGS,
  popup: {
    theme: 'dark',
    eqMode: 'sliders',
    collapsedSections: {
      equalizer: false,
      effects: false
    }
  }
};
