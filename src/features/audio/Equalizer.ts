import { EQUALIZER_BANDS, MAX_EQ_GAIN_DB, MIN_EQ_GAIN_DB, createFlatEqualizerSettings } from './constants';
import type { EqualizerBandFrequency, EqualizerSettings } from './types';

const FILTER_Q = Math.SQRT1_2;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** Implements the SheynEQ 10-band equalizer using BiquadFilterNode instances. */
export class Equalizer {
  private readonly filters: Map<EqualizerBandFrequency, BiquadFilterNode>;

  /** Creates all equalizer filter nodes for the supplied AudioContext. */
  constructor(private readonly context: AudioContext) {
    this.filters = new Map(
      EQUALIZER_BANDS.map((frequency) => {
        const filter = this.context.createBiquadFilter();
        filter.type = 'peaking';
        filter.frequency.value = frequency;
        filter.Q.value = FILTER_Q;
        filter.gain.value = 0;
        return [frequency, filter];
      })
    );
  }

  /** Returns the first filter node in the equalizer chain. */
  getInput(): AudioNode {
    return this.getOrderedFilters()[0];
  }

  /** Returns the last filter node in the equalizer chain. */
  getOutput(): AudioNode {
    return this.getOrderedFilters()[this.filters.size - 1];
  }

  /** Connects all equalizer filters in frequency order. */
  connectChain(): void {
    const orderedFilters = this.getOrderedFilters();

    for (let index = 0; index < orderedFilters.length - 1; index += 1) {
      orderedFilters[index].connect(orderedFilters[index + 1]);
    }
  }

  /** Disconnects every equalizer filter. */
  disconnect(): void {
    this.filters.forEach((filter) => {
      filter.disconnect();
    });
  }

  /** Applies a full 10-band equalizer settings object. */
  setSettings(settings: Partial<EqualizerSettings>): void {
    EQUALIZER_BANDS.forEach((frequency) => {
      this.setBandGain(frequency, settings[frequency] ?? 0);
    });
  }

  /** Sets a single equalizer band gain, clamped from -12 dB to +12 dB. */
  setBandGain(frequency: EqualizerBandFrequency, gainDb: number): void {
    const filter = this.filters.get(frequency);

    if (!filter) {
      throw new Error(`Unsupported equalizer frequency: ${frequency}`);
    }

    filter.gain.setTargetAtTime(clamp(gainDb, MIN_EQ_GAIN_DB, MAX_EQ_GAIN_DB), this.context.currentTime, 0.015);
  }

  /** Returns the current serializable equalizer settings. */
  getSettings(): EqualizerSettings {
    return EQUALIZER_BANDS.reduce<EqualizerSettings>((settings, frequency) => {
      settings[frequency] = this.filters.get(frequency)?.gain.value ?? 0;
      return settings;
    }, createFlatEqualizerSettings());
  }

  private getOrderedFilters(): BiquadFilterNode[] {
    return EQUALIZER_BANDS.map((frequency) => {
      const filter = this.filters.get(frequency);

      if (!filter) {
        throw new Error(`Equalizer filter missing for frequency: ${frequency}`);
      }

      return filter;
    });
  }
}
