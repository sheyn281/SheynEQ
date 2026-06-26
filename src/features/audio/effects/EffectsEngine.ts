import { localStorageArea, type LocalStorageArea } from '../../../shared/browser/storage';
import { BassBoost } from './BassBoost';
import {
  EFFECT_ORDER,
  EFFECTS_STORAGE_KEY,
  EffectChain,
  type AudioEffect,
  type EffectId,
  type EffectInstance,
  type EffectParametersMap,
  type EffectsPreset,
  type EffectsPresetName,
  type EffectsSettings
} from './EffectChain';
import { Reverb } from './Reverb';

/** Default serializable effects settings. */
export const DEFAULT_EFFECTS_SETTINGS: EffectsSettings = {
  bassBoost: {
    enabled: false,
    amount: 0.35,
    frequency: 95
  },
  reverb: {
    enabled: false,
    mix: 0.18,
    decay: 1.4,
    dampening: 0.35
  },
  slowedReverb: {
    enabled: false,
    amount: 0.45,
    speed: 0.85,
    preservePitch: true
  },
  nightcore: {
    enabled: false,
    amount: 0.5,
    speed: 1.15
  },
  speed: {
    enabled: false,
    rate: 1
  },
  pitch: {
    enabled: false,
    semitones: 0
  }
};

const BUILT_IN_EFFECT_PRESETS: readonly EffectsPreset[] = [
  {
    name: 'Clean',
    settings: DEFAULT_EFFECTS_SETTINGS
  },
  {
    name: 'Bass Boost',
    settings: {
      ...DEFAULT_EFFECTS_SETTINGS,
      bassBoost: { enabled: true, amount: 0.55, frequency: 90 }
    }
  },
  {
    name: 'Reverb',
    settings: {
      ...DEFAULT_EFFECTS_SETTINGS,
      reverb: { enabled: true, mix: 0.28, decay: 2, dampening: 0.35 }
    }
  },
  {
    name: 'Slowed + Reverb',
    settings: {
      ...DEFAULT_EFFECTS_SETTINGS,
      reverb: { enabled: true, mix: 0.32, decay: 2.4, dampening: 0.38 },
      slowedReverb: { enabled: true, amount: 0.5, speed: 0.85, preservePitch: true }
    }
  },
  {
    name: 'Nightcore',
    settings: {
      ...DEFAULT_EFFECTS_SETTINGS,
      nightcore: { enabled: true, amount: 0.5, speed: 1.15 }
    }
  },
  {
    name: 'Speed',
    settings: {
      ...DEFAULT_EFFECTS_SETTINGS,
      speed: { enabled: true, rate: 1.15 }
    }
  }
];

/** Professional Web Audio DSP effects engine for SheynEQ. */
export class EffectsEngine {
  readonly input: GainNode;
  readonly output: GainNode;
  private readonly effects: Map<EffectId, EffectInstance>;
  private readonly chain: EffectChain;
  private settings: EffectsSettings;
  private isDisposed = false;

  /** Creates the full DSP effects chain for an AudioContext. */
  constructor(
    private readonly context: AudioContext,
    settings: Partial<EffectsSettings> = {},
    private readonly storage: LocalStorageArea = localStorageArea,
    private readonly storageKey = EFFECTS_STORAGE_KEY
  ) {
    this.input = this.context.createGain();
    this.output = this.context.createGain();
    this.settings = this.mergeSettings(settings);
    this.effects = this.createEffects(this.settings);
    this.chain = new EffectChain(EFFECT_ORDER.map((id) => this.getEffect(id)));
    this.input.connect(this.chain.getInput());
    this.chain.connect();
    this.chain.getOutput().connect(this.output);
    this.settings = this.readSettingsFromEffects();
  }

  /** Loads persisted settings and applies them to the running effects chain. */
  async load(): Promise<EffectsSettings> {
    this.assertActive();
    const storedSettings = await this.storage.get<Partial<EffectsSettings>>(this.storageKey);
    this.settings = this.mergeSettings(storedSettings);
    this.applySettings(this.settings);
    return this.getSettings();
  }

  /** Saves the current normalized settings to Chrome storage. */
  async save(): Promise<void> {
    this.assertActive();
    await this.storage.set(this.storageKey, this.getSettings());
  }

  /** Applies and persists a partial update for one effect. */
  async updateEffect<TEffectId extends EffectId>(
    effectId: TEffectId,
    parameters: Partial<EffectParametersMap[TEffectId]>
  ): Promise<EffectsSettings> {
    this.assertActive();
    const effect = this.getTypedEffect(effectId);
    effect.setParameters(parameters);
    this.settings = this.readSettingsFromEffects();
    await this.save();
    return this.getSettings();
  }

  /** Enables or bypasses one effect and persists the new state. */
  async setEffectEnabled(effectId: EffectId, enabled: boolean): Promise<EffectsSettings> {
    return this.updateEffect(effectId, { enabled } as Partial<EffectParametersMap[typeof effectId]>);
  }

  /** Applies a complete settings object to all effects without changing storage. */
  applySettings(settings: Partial<EffectsSettings>): void {
    this.assertActive();
    const mergedSettings = this.mergeSettings(settings);

    EFFECT_ORDER.forEach((effectId) => {
      const effect = this.getTypedEffect(effectId);
      effect.setParameters(mergedSettings[effectId]);
    });

    this.settings = mergedSettings;
    this.settings = this.readSettingsFromEffects();
  }

  /** Applies a built-in effects preset and persists it. */
  async applyPreset(name: EffectsPresetName): Promise<EffectsSettings> {
    const preset = this.getPreset(name);
    this.applySettings(preset.settings);
    await this.save();
    return this.getSettings();
  }

  /** Returns cloned built-in effects presets. */
  getPresets(): EffectsPreset[] {
    return BUILT_IN_EFFECT_PRESETS.map((preset) => this.clonePreset(preset));
  }

  /** Returns a cloned built-in preset by name. */
  getPreset(name: EffectsPresetName): EffectsPreset {
    const preset = BUILT_IN_EFFECT_PRESETS.find((candidate) => candidate.name === name);

    if (!preset) {
      throw new Error(`Unknown effects preset: ${name}`);
    }

    return this.clonePreset(preset);
  }

  /** Returns cloned normalized settings for all effects. */
  getSettings(): EffectsSettings {
    this.assertActive();
    return this.readSettingsFromEffects();
  }

  /** Disconnects and disposes all effect nodes. */
  dispose(): void {
    if (this.isDisposed) {
      return;
    }

    this.input.disconnect();
    this.chain.dispose();
    this.output.disconnect();
    this.isDisposed = true;
  }

  private createEffects(settings: EffectsSettings): Map<EffectId, EffectInstance> {
    return new Map<EffectId, EffectInstance>([
      ['bassBoost', new BassBoost(this.context, settings.bassBoost)],
      ['reverb', new Reverb(this.context, settings.reverb)]
    ]);
  }

  private getEffect(effectId: EffectId): EffectInstance {
    const effect = this.effects.get(effectId);

    if (!effect) {
      throw new Error(`Effect not registered: ${effectId}`);
    }

    return effect;
  }

  private getTypedEffect<TEffectId extends EffectId>(effectId: TEffectId): AudioEffect<EffectParametersMap[TEffectId]> {
    return this.getEffect(effectId) as AudioEffect<EffectParametersMap[TEffectId]>;
  }

  private mergeSettings(settings: Partial<EffectsSettings> | undefined): EffectsSettings {
    return {
      bassBoost: { ...DEFAULT_EFFECTS_SETTINGS.bassBoost, ...settings?.bassBoost },
      reverb: { ...DEFAULT_EFFECTS_SETTINGS.reverb, ...settings?.reverb },
      slowedReverb: { ...DEFAULT_EFFECTS_SETTINGS.slowedReverb, ...settings?.slowedReverb },
      nightcore: { ...DEFAULT_EFFECTS_SETTINGS.nightcore, ...settings?.nightcore },
      speed: { ...DEFAULT_EFFECTS_SETTINGS.speed, ...settings?.speed },
      pitch: { ...DEFAULT_EFFECTS_SETTINGS.pitch, ...settings?.pitch }
    };
  }

  private clonePreset(preset: EffectsPreset): EffectsPreset {
    return {
      name: preset.name,
      settings: this.mergeSettings(preset.settings)
    };
  }

  private readSettingsFromEffects(): EffectsSettings {
    return {
      bassBoost: this.getTypedEffect('bassBoost').getParameters(),
      reverb: this.getTypedEffect('reverb').getParameters(),
      slowedReverb: { ...this.settings.slowedReverb },
      nightcore: { ...this.settings.nightcore },
      speed: { ...this.settings.speed },
      pitch: { ...this.settings.pitch }
    };
  }

  private assertActive(): void {
    if (this.isDisposed) {
      throw new Error('EffectsEngine has been disposed.');
    }
  }
}
