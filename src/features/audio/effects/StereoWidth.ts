import { BypassableEffect, EFFECT_RAMP_SECONDS, clampParameter, type EffectBypassState } from './EffectChain';

/** Runtime parameters for stereo width processing. */
export interface StereoWidthParameters extends EffectBypassState {
  /** Width from 0 mono-compatible to 2 expanded. */
  width: number;
}

/** Adjusts stereo width with a gain matrix that preserves level. */
export class StereoWidth extends BypassableEffect<StereoWidthParameters> {
  private readonly splitter: ChannelSplitterNode;
  private readonly merger: ChannelMergerNode;
  private readonly leftToLeft: GainNode;
  private readonly leftToRight: GainNode;
  private readonly rightToLeft: GainNode;
  private readonly rightToRight: GainNode;
  private readonly safetyTrim: GainNode;

  /** Creates a stereo width effect. */
  constructor(context: AudioContext, parameters: Partial<StereoWidthParameters> = {}) {
    super('stereoWidth', context, {
      enabled: false,
      width: 1,
      ...parameters
    });
    this.splitter = this.context.createChannelSplitter(2);
    this.merger = this.context.createChannelMerger(2);
    this.leftToLeft = this.context.createGain();
    this.leftToRight = this.context.createGain();
    this.rightToLeft = this.context.createGain();
    this.rightToRight = this.context.createGain();
    this.safetyTrim = this.context.createGain();
    this.initializeRouting();
  }

  protected normalizeParameters(parameters: StereoWidthParameters): StereoWidthParameters {
    return {
      enabled: parameters.enabled,
      width: clampParameter(parameters.width, 0, 2, 1)
    };
  }

  protected applyParameters(): void {
    const now = this.context.currentTime;
    const width = this.parameters.width;
    const sameChannelGain = 0.5 + width * 0.5;
    const crossChannelGain = 0.5 - width * 0.5;
    const trim = width > 1 ? 1 / (1 + (width - 1) * 0.25) : 1;

    this.leftToLeft.gain.setTargetAtTime(sameChannelGain, now, EFFECT_RAMP_SECONDS);
    this.rightToRight.gain.setTargetAtTime(sameChannelGain, now, EFFECT_RAMP_SECONDS);
    this.leftToRight.gain.setTargetAtTime(crossChannelGain, now, EFFECT_RAMP_SECONDS);
    this.rightToLeft.gain.setTargetAtTime(crossChannelGain, now, EFFECT_RAMP_SECONDS);
    this.safetyTrim.gain.setTargetAtTime(trim, now, EFFECT_RAMP_SECONDS);
  }

  protected connectEffect(): void {
    this.input.connect(this.splitter);
    this.splitter.connect(this.leftToLeft, 0);
    this.splitter.connect(this.leftToRight, 0);
    this.splitter.connect(this.rightToLeft, 1);
    this.splitter.connect(this.rightToRight, 1);
    this.leftToLeft.connect(this.merger, 0, 0);
    this.rightToLeft.connect(this.merger, 0, 0);
    this.leftToRight.connect(this.merger, 0, 1);
    this.rightToRight.connect(this.merger, 0, 1);
    this.merger.connect(this.safetyTrim);
    this.safetyTrim.connect(this.output);
  }

  protected disconnectEffect(): void {
    this.splitter.disconnect();
    this.leftToLeft.disconnect();
    this.leftToRight.disconnect();
    this.rightToLeft.disconnect();
    this.rightToRight.disconnect();
    this.merger.disconnect();
    this.safetyTrim.disconnect();
  }
}
