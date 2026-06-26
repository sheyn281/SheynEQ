import { AudioAnalyzer } from './AudioAnalyzer';
import { EffectsEngine } from './effects/EffectsEngine';
import { Equalizer } from './Equalizer';
import type { AnalyzerFrame, AudioCoreSettings } from './types';
import type { EffectId, EffectParametersMap, EffectsSettings } from './effects/EffectChain';

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** Owns and connects the SheynEQ browser audio node graph. */
export class AudioGraph {
  private mediaSource: MediaElementAudioSourceNode | null = null;
  private readonly gainNode: GainNode;
  private readonly pannerNode: StereoPannerNode;
  private readonly analyserNode: AnalyserNode;
  private readonly equalizer: Equalizer;
  private readonly effectsEngine: EffectsEngine;
  private readonly analyzer: AudioAnalyzer;
  private isDisposed = false;

  /** Creates and connects the static audio processing graph. */
  constructor(private readonly context: AudioContext) {
    this.gainNode = this.context.createGain();
    this.pannerNode = this.context.createStereoPanner();
    this.analyserNode = this.context.createAnalyser();
    this.equalizer = new Equalizer(this.context);
    this.effectsEngine = new EffectsEngine(this.context);
    this.analyzer = new AudioAnalyzer(this.analyserNode, this.context.sampleRate);

    this.configureDefaults();
    this.connectStaticGraph();
  }

  /** Connects an HTML media element to the graph as its input source. */
  connectMediaElement(mediaElement: HTMLMediaElement): void {
    this.assertActive();

    if (this.mediaSource) {
      this.mediaSource.disconnect();
    }

    this.mediaSource = this.context.createMediaElementSource(mediaElement);
    this.mediaSource.connect(this.equalizer.getInput());
  }

  /** Applies serializable core settings to the graph nodes. */
  applySettings(settings: AudioCoreSettings): void {
    this.assertActive();
    const now = this.context.currentTime;

    this.gainNode.gain.setTargetAtTime(clamp(settings.masterGain, 0, 1), now, 0.015);
    this.pannerNode.pan.setTargetAtTime(clamp(settings.pan, -1, 1), now, 0.015);
    this.equalizer.setSettings(settings.equalizer);
  }

  /** Applies serializable effects settings to the graph effects engine. */
  applyEffectsSettings(settings: Partial<EffectsSettings>): void {
    this.assertActive();
    this.effectsEngine.applySettings(settings);
  }

  /** Updates one effect in the graph without persisting. */
  setEffect<TEffectId extends EffectId>(effectId: TEffectId, parameters: Partial<EffectParametersMap[TEffectId]>): void {
    this.assertActive();
    this.effectsEngine.applySettings({
      [effectId]: {
        ...this.effectsEngine.getSettings()[effectId],
        ...parameters
      }
    } as Partial<EffectsSettings>);
  }

  /** Sets the master gain from 0 to 1. */
  setMasterGain(gain: number): void {
    this.assertActive();
    this.gainNode.gain.setTargetAtTime(clamp(gain, 0, 1), this.context.currentTime, 0.015);
  }

  /** Sets stereo pan from -1 left to +1 right. */
  setPan(pan: number): void {
    this.assertActive();
    this.pannerNode.pan.setTargetAtTime(clamp(pan, -1, 1), this.context.currentTime, 0.015);
  }

  /** Returns the equalizer controller for direct band updates. */
  getEqualizer(): Equalizer {
    this.assertActive();
    return this.equalizer;
  }

  /** Returns the graph effects engine for advanced runtime control. */
  getEffectsEngine(): EffectsEngine {
    this.assertActive();
    return this.effectsEngine;
  }

  /** Captures analyzer data and derived metrics for the current audio frame. */
  analyze(): AnalyzerFrame {
    this.assertActive();
    return this.analyzer.captureFrame();
  }

  /** Returns the final graph output node connected to the AudioContext destination. */
  getOutputNode(): AudioNode {
    this.assertActive();
    return this.analyserNode;
  }

  /** Disconnects every owned node and makes the graph unusable. */
  dispose(): void {
    if (this.isDisposed) {
      return;
    }

    this.mediaSource?.disconnect();
    this.equalizer.disconnect();
    this.effectsEngine.dispose();
    this.gainNode.disconnect();
    this.pannerNode.disconnect();
    this.analyserNode.disconnect();
    this.mediaSource = null;
    this.isDisposed = true;
  }

  private configureDefaults(): void {
    this.gainNode.gain.value = 1;
    this.pannerNode.pan.value = 0;
    this.analyserNode.fftSize = 2048;
    this.analyserNode.smoothingTimeConstant = 0.82;
  }

  private connectStaticGraph(): void {
    this.equalizer.connectChain();
    this.equalizer.getOutput().connect(this.effectsEngine.input);
    this.effectsEngine.output.connect(this.gainNode);
    this.gainNode.connect(this.pannerNode);
    this.pannerNode.connect(this.analyserNode);
    this.analyserNode.connect(this.context.destination);
  }

  private assertActive(): void {
    if (this.isDisposed) {
      throw new Error('AudioGraph has been disposed.');
    }
  }
}
