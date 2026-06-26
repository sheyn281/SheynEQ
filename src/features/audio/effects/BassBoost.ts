import { BypassableEffect, EFFECT_RAMP_SECONDS, clampParameter, type EffectBypassState } from './EffectChain';

/** Runtime parameters for the BassBoost effect. */
export interface BassBoostParameters extends EffectBypassState {
  /** Boost amount from 0 to 1. */
  amount: number;
  /** Low-shelf center frequency in hertz. */
  frequency: number;
}

/** Enhances low frequencies with a gain-compensated low-shelf filter. */
export class BassBoost extends BypassableEffect<BassBoostParameters> {
  private readonly lowShelf: BiquadFilterNode;
  private readonly trim: GainNode;

  /** Creates a bass boost effect. */
  constructor(context: AudioContext, parameters: Partial<BassBoostParameters> = {}) {
    super('bassBoost', context, {
      enabled: false,
      amount: 0.35,
      frequency: 95,
      ...parameters
    });
    this.lowShelf = this.context.createBiquadFilter();
    this.trim = this.context.createGain();
    this.lowShelf.type = 'lowshelf';
    this.initializeRouting();
  }

  protected normalizeParameters(parameters: BassBoostParameters): BassBoostParameters {
    return {
      enabled: parameters.enabled,
      amount: clampParameter(parameters.amount, 0, 1, 0.35),
      frequency: clampParameter(parameters.frequency, 45, 220, 95)
    };
  }

  protected applyParameters(): void {
    const now = this.context.currentTime;
    const gainDb = this.parameters.amount * 12;
    const trimGain = Math.pow(10, (-gainDb * 0.22) / 20);

    this.lowShelf.frequency.setTargetAtTime(this.parameters.frequency, now, EFFECT_RAMP_SECONDS);
    this.lowShelf.gain.setTargetAtTime(gainDb, now, EFFECT_RAMP_SECONDS);
    this.trim.gain.setTargetAtTime(trimGain, now, EFFECT_RAMP_SECONDS);
  }

  protected connectEffect(): void {
    this.input.connect(this.lowShelf);
    this.lowShelf.connect(this.trim);
    this.trim.connect(this.output);
  }

  protected disconnectEffect(): void {
    this.lowShelf.disconnect();
    this.trim.disconnect();
  }
}
