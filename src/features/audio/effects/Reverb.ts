import { BypassableEffect, EFFECT_RAMP_SECONDS, clampParameter, type EffectBypassState } from './EffectChain';

/** Runtime parameters for convolution reverb. */
export interface ReverbParameters extends EffectBypassState {
  /** Wet signal amount from 0 to 1. */
  mix: number;
  /** Impulse duration in seconds. */
  decay: number;
  /** High-frequency damping from 0 bright to 1 dark. */
  dampening: number;
}

/** Adds generated convolution reverb with dry/wet bypass-safe routing. */
export class Reverb extends BypassableEffect<ReverbParameters> {
  private readonly dryGain: GainNode;
  private readonly wetGain: GainNode;
  private readonly convolver: ConvolverNode;
  private readonly dampeningFilter: BiquadFilterNode;
  private impulseSignature = '';

  /** Creates a generated convolution reverb effect. */
  constructor(context: AudioContext, parameters: Partial<ReverbParameters> = {}) {
    super('reverb', context, {
      enabled: false,
      mix: 0.18,
      decay: 1.4,
      dampening: 0.35,
      ...parameters
    });
    this.dryGain = this.context.createGain();
    this.wetGain = this.context.createGain();
    this.convolver = this.context.createConvolver();
    this.dampeningFilter = this.context.createBiquadFilter();
    this.dampeningFilter.type = 'lowpass';
    this.initializeRouting();
  }

  protected normalizeParameters(parameters: ReverbParameters): ReverbParameters {
    return {
      enabled: parameters.enabled,
      mix: clampParameter(parameters.mix, 0, 0.8, 0.18),
      decay: clampParameter(parameters.decay, 0.2, 6, 1.4),
      dampening: clampParameter(parameters.dampening, 0, 1, 0.35)
    };
  }

  protected applyParameters(): void {
    const now = this.context.currentTime;
    const mix = this.parameters.mix;
    const signature = `${this.parameters.decay.toFixed(2)}:${this.parameters.dampening.toFixed(2)}`;

    if (signature !== this.impulseSignature) {
      this.convolver.buffer = this.createImpulseResponse(this.parameters.decay, this.parameters.dampening);
      this.impulseSignature = signature;
    }

    this.dryGain.gain.setTargetAtTime(1 - mix * 0.45, now, EFFECT_RAMP_SECONDS);
    this.wetGain.gain.setTargetAtTime(mix, now, EFFECT_RAMP_SECONDS);
    this.dampeningFilter.frequency.setTargetAtTime(18000 - this.parameters.dampening * 14000, now, EFFECT_RAMP_SECONDS);
  }

  protected connectEffect(): void {
    this.input.connect(this.dryGain);
    this.input.connect(this.convolver);
    this.convolver.connect(this.dampeningFilter);
    this.dampeningFilter.connect(this.wetGain);
    this.dryGain.connect(this.output);
    this.wetGain.connect(this.output);
  }

  protected disconnectEffect(): void {
    this.dryGain.disconnect();
    this.convolver.disconnect();
    this.dampeningFilter.disconnect();
    this.wetGain.disconnect();
  }

  private createImpulseResponse(decay: number, dampening: number): AudioBuffer {
    const sampleRate = this.context.sampleRate;
    const length = Math.max(1, Math.floor(sampleRate * decay));
    const impulse = this.context.createBuffer(2, length, sampleRate);

    for (let channel = 0; channel < impulse.numberOfChannels; channel += 1) {
      const data = impulse.getChannelData(channel);

      for (let index = 0; index < length; index += 1) {
        const normalizedIndex = index / length;
        const envelope = Math.pow(1 - normalizedIndex, 1.8 + dampening * 2.2);
        const noise = this.deterministicNoise(index, channel);
        data[index] = noise * envelope;
      }
    }

    return impulse;
  }

  private deterministicNoise(index: number, channel: number): number {
    const value = Math.sin((index + 1) * (channel + 1) * 12.9898) * 43758.5453;
    return (value - Math.floor(value)) * 2 - 1;
  }
}
