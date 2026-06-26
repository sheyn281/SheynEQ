import { BypassableEffect, EFFECT_RAMP_SECONDS, clampParameter, type EffectBypassState } from './EffectChain';

/** Runtime parameters for protected volume boost. */
export interface VolumeBoostParameters extends EffectBypassState {
  /** Boost amount in dB before safety clipping. */
  boostDb: number;
}

/** Raises perceived volume while controlling peaks with soft saturation. */
export class VolumeBoost extends BypassableEffect<VolumeBoostParameters> {
  private readonly boostGain: GainNode;
  private readonly softClipper: WaveShaperNode;
  private readonly trim: GainNode;

  /** Creates a volume boost effect. */
  constructor(context: AudioContext, parameters: Partial<VolumeBoostParameters> = {}) {
    super('volumeBoost', context, {
      enabled: false,
      boostDb: 3,
      ...parameters
    });
    this.boostGain = this.context.createGain();
    this.softClipper = this.context.createWaveShaper();
    this.trim = this.context.createGain();
    this.softClipper.oversample = '4x';
    this.initializeRouting();
  }

  protected normalizeParameters(parameters: VolumeBoostParameters): VolumeBoostParameters {
    return {
      enabled: parameters.enabled,
      boostDb: clampParameter(parameters.boostDb, 0, 12, 3)
    };
  }

  protected applyParameters(): void {
    const now = this.context.currentTime;
    const boostGain = Math.pow(10, this.parameters.boostDb / 20);
    const trimGain = 1 / Math.max(1, boostGain * 0.72);

    this.boostGain.gain.setTargetAtTime(boostGain, now, EFFECT_RAMP_SECONDS);
    this.trim.gain.setTargetAtTime(trimGain, now, EFFECT_RAMP_SECONDS);
    this.softClipper.curve = this.createSaturationCurve();
  }

  protected connectEffect(): void {
    this.input.connect(this.boostGain);
    this.boostGain.connect(this.softClipper);
    this.softClipper.connect(this.trim);
    this.trim.connect(this.output);
  }

  protected disconnectEffect(): void {
    this.boostGain.disconnect();
    this.softClipper.disconnect();
    this.trim.disconnect();
  }

  private createSaturationCurve(): Float32Array<ArrayBuffer> {
    const samples = 2048;
    const curve = new Float32Array(samples);

    for (let index = 0; index < samples; index += 1) {
      const x = (index / (samples - 1)) * 2 - 1;
      curve[index] = Math.tanh(x * 1.45) / Math.tanh(1.45);
    }

    return curve;
  }
}
