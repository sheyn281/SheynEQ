import { BypassableEffect, EFFECT_RAMP_SECONDS, clampParameter, type EffectBypassState } from './EffectChain';

/** Runtime parameters for the final soft limiter. */
export interface LimiterParameters extends EffectBypassState {
  /** Limiter ceiling in dBFS. */
  ceilingDb: number;
  /** Input drive before soft clipping in dB. */
  driveDb: number;
}

/** Prevents clipping with compression plus a soft waveshaper ceiling. */
export class Limiter extends BypassableEffect<LimiterParameters> {
  private readonly inputGain: GainNode;
  private readonly compressor: DynamicsCompressorNode;
  private readonly softClipper: WaveShaperNode;
  private readonly outputTrim: GainNode;

  /** Creates a soft limiter effect. */
  constructor(context: AudioContext, parameters: Partial<LimiterParameters> = {}) {
    super('limiter', context, {
      enabled: true,
      ceilingDb: -1,
      driveDb: 0,
      ...parameters
    });
    this.inputGain = this.context.createGain();
    this.compressor = this.context.createDynamicsCompressor();
    this.softClipper = this.context.createWaveShaper();
    this.outputTrim = this.context.createGain();
    this.compressor.knee.value = 0;
    this.compressor.ratio.value = 20;
    this.compressor.attack.value = 0.001;
    this.compressor.release.value = 0.08;
    this.softClipper.oversample = '4x';
    this.initializeRouting();
  }

  protected normalizeParameters(parameters: LimiterParameters): LimiterParameters {
    return {
      enabled: parameters.enabled,
      ceilingDb: clampParameter(parameters.ceilingDb, -12, -0.1, -1),
      driveDb: clampParameter(parameters.driveDb, 0, 12, 0)
    };
  }

  protected applyParameters(): void {
    const now = this.context.currentTime;
    const driveGain = Math.pow(10, this.parameters.driveDb / 20);
    const ceilingGain = Math.pow(10, this.parameters.ceilingDb / 20);

    this.inputGain.gain.setTargetAtTime(driveGain, now, EFFECT_RAMP_SECONDS);
    this.compressor.threshold.setTargetAtTime(this.parameters.ceilingDb - this.parameters.driveDb, now, EFFECT_RAMP_SECONDS);
    this.outputTrim.gain.setTargetAtTime(ceilingGain / Math.max(1, driveGain * 0.65), now, EFFECT_RAMP_SECONDS);
    this.softClipper.curve = this.createSoftClipCurve(ceilingGain);
  }

  protected connectEffect(): void {
    this.input.connect(this.inputGain);
    this.inputGain.connect(this.compressor);
    this.compressor.connect(this.softClipper);
    this.softClipper.connect(this.outputTrim);
    this.outputTrim.connect(this.output);
  }

  protected disconnectEffect(): void {
    this.inputGain.disconnect();
    this.compressor.disconnect();
    this.softClipper.disconnect();
    this.outputTrim.disconnect();
  }

  private createSoftClipCurve(ceilingGain: number): Float32Array<ArrayBuffer> {
    const samples = 2048;
    const curve = new Float32Array(samples);

    for (let index = 0; index < samples; index += 1) {
      const x = (index / (samples - 1)) * 2 - 1;
      curve[index] = Math.tanh(x * 1.7) * ceilingGain;
    }

    return curve;
  }
}
