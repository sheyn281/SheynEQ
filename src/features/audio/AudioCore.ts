import { AudioContextManager } from './AudioContextManager';
import { AudioCoreStorage } from './AudioCoreStorage';
import { AudioGraph } from './AudioGraph';
import { DEFAULT_AUDIO_CORE_SETTINGS } from './constants';
import { PresetManager } from './PresetManager';
import type {
  AnalyzerFrame,
  AudioCoreSettings,
  AudioEngineStatus,
  EqualizerBandFrequency,
  EqualizerPreset,
  PresetName
} from './types';

/** High-level production audio core facade for SheynEQ effects. */
export class AudioCore {
  private graph: AudioGraph | null = null;
  private settings: AudioCoreSettings = DEFAULT_AUDIO_CORE_SETTINGS;

  /** Creates an audio core facade with injectable services for tests. */
  constructor(
    private readonly contextManager = AudioContextManager.getInstance(),
    private readonly presetManager = new PresetManager(),
    private readonly storage = new AudioCoreStorage()
  ) {}

  /** Initializes the graph lazily and loads persisted settings. */
  async initialize(): Promise<AudioCoreSettings> {
    this.settings = await this.storage.load();
    this.getGraph().applySettings(this.settings);
    return this.getSettings();
  }

  /** Connects an HTML media element as the audio source. */
  connectMediaElement(mediaElement: HTMLMediaElement): void {
    this.getGraph().connectMediaElement(mediaElement);
  }

  /** Resumes audio playback processing. */
  async resume(): Promise<AudioEngineStatus> {
    return this.contextManager.resume();
  }

  /** Suspends audio playback processing. */
  async suspend(): Promise<AudioEngineStatus> {
    return this.contextManager.suspend();
  }

  /** Updates and persists the master gain. */
  async setMasterGain(gain: number): Promise<AudioCoreSettings> {
    this.settings = { ...this.settings, masterGain: gain };
    this.getGraph().setMasterGain(gain);
    await this.storage.save(this.settings);
    return this.getSettings();
  }

  /** Updates and persists stereo panning. */
  async setPan(pan: number): Promise<AudioCoreSettings> {
    this.settings = { ...this.settings, pan };
    this.getGraph().setPan(pan);
    await this.storage.save(this.settings);
    return this.getSettings();
  }

  /** Updates and persists a single equalizer band. */
  async setEqualizerBand(frequency: EqualizerBandFrequency, gainDb: number): Promise<AudioCoreSettings> {
    const equalizer = { ...this.settings.equalizer, [frequency]: gainDb };
    this.settings = { ...this.settings, equalizer };
    this.getGraph().getEqualizer().setBandGain(frequency, gainDb);
    await this.storage.save(this.settings);
    return this.getSettings();
  }

  /** Applies and persists a built-in equalizer preset. */
  async applyPreset(name: PresetName): Promise<AudioCoreSettings> {
    const equalizer = this.presetManager.getEqualizerSettings(name);
    this.settings = { ...this.settings, equalizer, presetName: name };
    this.getGraph().applySettings(this.settings);
    await this.storage.save(this.settings);
    return this.getSettings();
  }

  /** Returns all built-in equalizer presets. */
  getPresets(): EqualizerPreset[] {
    return this.presetManager.getPresets();
  }

  /** Captures analyzer FFT, waveform, RMS, peak, and frequency energy metrics. */
  analyze(): AnalyzerFrame {
    return this.getGraph().analyze();
  }

  /** Returns the current core status. */
  getStatus(): AudioEngineStatus {
    return this.contextManager.getStatus();
  }

  /** Returns a cloned copy of the current serializable settings. */
  getSettings(): AudioCoreSettings {
    return {
      ...this.settings,
      equalizer: { ...this.settings.equalizer }
    };
  }

  /** Safely disposes the graph and the shared AudioContext. */
  async dispose(): Promise<void> {
    this.graph?.dispose();
    this.graph = null;
    await this.contextManager.dispose();
  }

  private getGraph(): AudioGraph {
    if (!this.graph) {
      this.graph = new AudioGraph(this.contextManager.getContext());
    }

    return this.graph;
  }
}
