import { EQUALIZER_BANDS, createFlatEqualizerSettings } from './constants';
import type { EqualizerPreset, EqualizerSettings, PresetName } from './types';

function createPreset(name: PresetName, gains: readonly number[]): EqualizerPreset {
  const equalizer = createFlatEqualizerSettings();

  EQUALIZER_BANDS.forEach((frequency, index) => {
    equalizer[frequency] = gains[index] ?? 0;
  });

  return { name, equalizer };
}

const BUILT_IN_PRESETS: readonly EqualizerPreset[] = [
  createPreset('Flat', [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
  createPreset('Bass Boost', [7, 6, 5, 3, 1, 0, -1, 0, 1, 2]),
  createPreset('Rock', [4, 5, 4, 2, -1, 1, 3, 5, 4, 3]),
  createPreset('Pop', [2, 3, 3, 1, -1, 2, 3, 4, 2, 1]),
  createPreset('EDM', [6, 7, 5, 2, -2, -1, 2, 5, 6, 5]),
  createPreset('Classical', [1, 1, 0, 0, 1, 1, 0, -1, -1, -2])
] as const;

/** Provides immutable access to SheynEQ built-in equalizer presets. */
export class PresetManager {
  private readonly presets = new Map<PresetName, EqualizerPreset>(
    BUILT_IN_PRESETS.map((preset) => [preset.name, preset])
  );

  /** Returns all built-in presets as cloned serializable objects. */
  getPresets(): EqualizerPreset[] {
    return BUILT_IN_PRESETS.map((preset) => this.clonePreset(preset));
  }

  /** Returns a cloned preset by name, or throws when the preset is unknown. */
  getPreset(name: PresetName): EqualizerPreset {
    const preset = this.presets.get(name);

    if (!preset) {
      throw new Error(`Unknown equalizer preset: ${name}`);
    }

    return this.clonePreset(preset);
  }

  /** Returns only the equalizer settings for a preset. */
  getEqualizerSettings(name: PresetName): EqualizerSettings {
    return this.getPreset(name).equalizer;
  }

  private clonePreset(preset: EqualizerPreset): EqualizerPreset {
    return {
      name: preset.name,
      equalizer: { ...preset.equalizer }
    };
  }
}
