import { BypassableEffect, EFFECT_RAMP_SECONDS, clampParameter, type EffectBypassState } from './EffectChain';

/** Runtime parameters for spatial placement. */
export interface SpatialAudioParameters extends EffectBypassState {
  /** Stereo pan from -1 left to +1 right. */
  pan: number;
  /** Perceived distance from 0 close to 1 far. */
  distance: number;
}

/** Applies stereo placement and distance-safe gain compensation. */
export class SpatialAudio extends BypassableEffect<SpatialAudioParameters> {
  private readonly panner: StereoPannerNode;
  private readonly distanceGain: GainNode;
  private readonly airFilter: BiquadFilterNode;

  /** Creates a spatial audio effect. */
  constructor(context: AudioContext, parameters: Partial<SpatialAudioParameters> = {}) {
    super('spatialAudio', context, {
      enabled: false,
      pan: 0,
      distance: 0,
      ...parameters
    });
    this.panner = this.context.createStereoPanner();
    this.distanceGain = this.context.createGain();
    this.airFilter = this.context.createBiquadFilter();
    this.airFilter.type = 'lowpass';
    this.initializeRouting();
  }

  protected normalizeParameters(parameters: SpatialAudioParameters): SpatialAudioParameters {
    return {
      enabled: parameters.enabled,
      pan: clampParameter(parameters.pan, -1, 1, 0),
      distance: clampParameter(parameters.distance, 0, 1, 0)
    };
  }

  protected applyParameters(): void {
    const now = this.context.currentTime;
    const distance = this.parameters.distance;

    this.panner.pan.setTargetAtTime(this.parameters.pan, now, EFFECT_RAMP_SECONDS);
    this.distanceGain.gain.setTargetAtTime(1 - distance * 0.32, now, EFFECT_RAMP_SECONDS);
    this.airFilter.frequency.setTargetAtTime(18000 - distance * 9000, now, EFFECT_RAMP_SECONDS);
  }

  protected connectEffect(): void {
    this.input.connect(this.panner);
    this.panner.connect(this.airFilter);
    this.airFilter.connect(this.distanceGain);
    this.distanceGain.connect(this.output);
  }

  protected disconnectEffect(): void {
    this.panner.disconnect();
    this.airFilter.disconnect();
    this.distanceGain.disconnect();
  }
}
