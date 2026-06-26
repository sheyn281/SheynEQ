/** Identifiers for the built-in SheynEQ DSP effects. */
export type EffectId = 'bassBoost' | 'reverb';

/** Shared bypass state for an effect. */
export interface EffectBypassState {
  /** Whether the effect processing path is active. */
  enabled: boolean;
}

/** Contract implemented by every Web Audio effect module. */
export interface AudioEffect<TParameters extends EffectBypassState> {
  /** Stable effect identifier. */
  readonly id: string;
  /** Input node used by the effect chain. */
  readonly input: AudioNode;
  /** Output node used by the effect chain. */
  readonly output: AudioNode;
  /** Returns a cloned copy of current parameters. */
  getParameters(): TParameters;
  /** Applies a partial parameter update at runtime. */
  setParameters(parameters: Partial<TParameters>): void;
  /** Enables or bypasses the effect. */
  setEnabled(enabled: boolean): void;
  /** Disconnects all owned nodes. */
  dispose(): void;
}

/** Parameter map for all built-in effects. */
export interface EffectParametersMap {
  /** Bass enhancement parameters. */
  bassBoost: import('./BassBoost').BassBoostParameters;
  /** Reverb parameters. */
  reverb: import('./Reverb').ReverbParameters;
}

/** Composite slowed playback plus reverb settings. */
export interface SlowedReverbSettings extends EffectBypassState {
  /** Effect intensity from 0 to 1. */
  amount: number;
  /** Slowed playback speed. */
  speed: number;
  /** Whether the browser should preserve pitch while slowing playback. */
  preservePitch: boolean;
}

/** Nightcore playback settings. */
export interface NightcoreSettings extends EffectBypassState {
  /** Nightcore intensity from 0 to 1. */
  amount: number;
  /** Faster playback speed. */
  speed: number;
}

/** Direct playback speed control. */
export interface SpeedSettings extends EffectBypassState {
  /** Playback rate from 0.5x to 1.5x. */
  rate: number;
}

/** Reserved settings for future independent pitch shifting. */
export interface PitchSettings extends EffectBypassState {
  /** Pitch offset in semitones. */
  semitones: number;
}

/** Serializable settings for all effects. */
export type EffectsSettings = {
  [Key in keyof EffectParametersMap]: EffectParametersMap[Key];
} & {
  /** Composite slowed playback plus reverb settings. */
  slowedReverb: SlowedReverbSettings;
  /** Nightcore playback settings. */
  nightcore: NightcoreSettings;
  /** Direct speed settings. */
  speed: SpeedSettings;
  /** Reserved pitch settings. */
  pitch: PitchSettings;
};

/** Effect preset definition for the whole DSP chain. */
export interface EffectsPreset {
  /** Stable preset name. */
  name: EffectsPresetName;
  /** Serializable effect settings. */
  settings: EffectsSettings;
}

/** Built-in effect preset names. */
export type EffectsPresetName = 'Clean' | 'Bass Boost' | 'Reverb' | 'Slowed + Reverb' | 'Nightcore' | 'Speed';

/** Ordered built-in effect ids for deterministic graph connection. */
export const EFFECT_ORDER: readonly EffectId[] = [
  'bassBoost',
  'reverb'
] as const;

/** Storage key for serialized DSP effects settings. */
export const EFFECTS_STORAGE_KEY = 'sheynfx.effects.v1';

/** Smooth automation time constant for effect parameter changes. */
export const EFFECT_RAMP_SECONDS = 0.015;

/** Returns a safe finite number in the requested range. */
export function clampParameter(value: number | undefined, min: number, max: number, fallback: number): number {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return fallback;
  }

  return Math.min(Math.max(value, min), max);
}

/** Base implementation for bypassable effects with stable input and output nodes. */
export abstract class BypassableEffect<TParameters extends EffectBypassState> implements AudioEffect<TParameters> {
  readonly input: GainNode;
  readonly output: GainNode;
  protected parameters: TParameters;
  private isDisposed = false;

  protected constructor(
    readonly id: string,
    protected readonly context: AudioContext,
    defaultParameters: TParameters
  ) {
    this.input = this.context.createGain();
    this.output = this.context.createGain();
    this.parameters = { ...defaultParameters };
  }

  /** Returns a cloned copy of current parameters. */
  getParameters(): TParameters {
    return { ...this.parameters };
  }

  /** Applies a partial parameter update at runtime. */
  setParameters(parameters: Partial<TParameters>): void {
    this.assertActive();
    const wasEnabled = this.parameters.enabled;
    this.parameters = this.normalizeParameters({ ...this.parameters, ...parameters });
    this.applyParameters();

    if (wasEnabled !== this.parameters.enabled) {
      this.reconnect();
    }
  }

  /** Enables or bypasses the effect. */
  setEnabled(enabled: boolean): void {
    this.setParameters({ enabled } as Partial<TParameters>);
  }

  /** Disconnects the public input and output nodes plus effect-specific nodes. */
  dispose(): void {
    if (this.isDisposed) {
      return;
    }

    this.disconnectInput();
    this.disconnectEffect();
    this.output.disconnect();
    this.isDisposed = true;
  }

  /** Reconnects the effect when bypass state changes. */
  protected reconnect(): void {
    this.assertActive();
    this.disconnectInput();
    this.disconnectEffect();

    if (this.parameters.enabled) {
      this.connectEffect();
    } else {
      this.input.connect(this.output);
    }
  }

  /** Initializes routing after subclass nodes have been created. */
  protected initializeRouting(): void {
    this.parameters = this.normalizeParameters(this.parameters);
    this.applyParameters();
    this.reconnect();
  }

  /** Disconnects only the public input node. */
  protected disconnectInput(): void {
    this.input.disconnect();
  }

  /** Throws when an effect is used after disposal. */
  protected assertActive(): void {
    if (this.isDisposed) {
      throw new Error(`${this.id} effect has been disposed.`);
    }
  }

  /** Applies clamping and defaults to incoming parameters. */
  protected abstract normalizeParameters(parameters: TParameters): TParameters;

  /** Applies normalized parameters to Web Audio nodes. */
  protected abstract applyParameters(): void;

  /** Connects the processed signal path from input to output. */
  protected abstract connectEffect(): void;

  /** Disconnects effect-specific nodes. */
  protected abstract disconnectEffect(): void;
}

/** Runtime effect instance used by the chain registry. */
export interface EffectInstance {
  /** Stable effect identifier. */
  readonly id: string;
  /** Input node used by the effect chain. */
  readonly input: AudioNode;
  /** Output node used by the effect chain. */
  readonly output: AudioNode;
  /** Enables or bypasses the effect. */
  setEnabled(enabled: boolean): void;
  /** Disconnects all owned nodes. */
  dispose(): void;
}

/** Connects multiple audio effects into a deterministic serial chain. */
export class EffectChain {
  private isDisposed = false;

  constructor(private readonly effects: readonly EffectInstance[]) {}

  /** Returns the first effect input node in the chain. */
  getInput(): AudioNode {
    this.assertActive();
    return this.effects[0].input;
  }

  /** Returns the final effect output node in the chain. */
  getOutput(): AudioNode {
    this.assertActive();
    return this.effects[this.effects.length - 1].output;
  }

  /** Connects every effect in serial order. */
  connect(): void {
    this.assertActive();
    this.disconnectChainLinks();

    for (let index = 0; index < this.effects.length - 1; index += 1) {
      this.effects[index].output.connect(this.effects[index + 1].input);
    }
  }

  /** Returns an effect by id. */
  getEffect<TEffect extends EffectInstance>(id: EffectId): TEffect {
    this.assertActive();
    const effect = this.effects.find((candidate) => candidate.id === id);

    if (!effect) {
      throw new Error(`Effect not found in chain: ${id}`);
    }

    return effect as TEffect;
  }

  /** Enables or bypasses a single effect. */
  setEffectEnabled(id: EffectId, enabled: boolean): void {
    this.getEffect(id).setEnabled(enabled);
  }

  /** Disconnects chain links and disposes all effects. */
  dispose(): void {
    if (this.isDisposed) {
      return;
    }

    this.disconnectChainLinks();
    this.effects.forEach((effect) => {
      effect.dispose();
    });
    this.isDisposed = true;
  }

  private disconnectChainLinks(): void {
    for (let index = 0; index < this.effects.length - 1; index += 1) {
      this.effects[index].output.disconnect();
    }
  }

  private assertActive(): void {
    if (this.isDisposed) {
      throw new Error('EffectChain has been disposed.');
    }

    if (this.effects.length === 0) {
      throw new Error('EffectChain requires at least one effect.');
    }
  }
}
