import { BypassableEffect, EFFECT_RAMP_SECONDS, clampParameter, type EffectBypassState } from './EffectChain';

/** Runtime parameters for dynamics compression. */
export interface CompressorParameters extends EffectBypassState {
  /** Compressor threshold in dB. */
  threshold: number;
  /** Compressor knee in dB. */
  knee: number;
  /** Compression ratio. */
  ratio: number;
  /** Attack time in seconds. */
  attack: number;
  /** Release time in seconds. */
  release: number;
}

/** Controls dynamic range using DynamicsCompressorNode. */
export class Compressor extends BypassableEffect<CompressorParameters> {
  private readonly compressor: DynamicsCompressorNode;

  /** Creates a compressor effect. */
  constructor(context: AudioContext, parameters: Partial<CompressorParameters> = {}) {
    super('compressor', context, {
      enabled: true,
      threshold: -18,
      knee: 24,
      ratio: 3,
      attack: 0.003,
      release: 0.25,
      ...parameters
    });
    this.compressor = this.context.createDynamicsCompressor();
    this.initializeRouting();
  }

  protected normalizeParameters(parameters: CompressorParameters): CompressorParameters {
    return {
      enabled: parameters.enabled,
      threshold: clampParameter(parameters.threshold, -60, 0, -18),
      knee: clampParameter(parameters.knee, 0, 40, 24),
      ratio: clampParameter(parameters.ratio, 1, 20, 3),
      attack: clampParameter(parameters.attack, 0, 1, 0.003),
      release: clampParameter(parameters.release, 0.01, 1, 0.25)
    };
  }

  protected applyParameters(): void {
    const now = this.context.currentTime;

    this.compressor.threshold.setTargetAtTime(this.parameters.threshold, now, EFFECT_RAMP_SECONDS);
    this.compressor.knee.setTargetAtTime(this.parameters.knee, now, EFFECT_RAMP_SECONDS);
    this.compressor.ratio.setTargetAtTime(this.parameters.ratio, now, EFFECT_RAMP_SECONDS);
    this.compressor.attack.setTargetAtTime(this.parameters.attack, now, EFFECT_RAMP_SECONDS);
    this.compressor.release.setTargetAtTime(this.parameters.release, now, EFFECT_RAMP_SECONDS);
  }

  protected connectEffect(): void {
    this.input.connect(this.compressor);
    this.compressor.connect(this.output);
  }

  protected disconnectEffect(): void {
    this.compressor.disconnect();
  }
}
