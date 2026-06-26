import { localStorageArea, type LocalStorageArea } from '../../shared/browser/storage';
import { DEFAULT_VISUALIZER_SETTINGS, VisualizerEngine } from './VisualizerEngine';
import { VISUALIZER_PROFILES } from './PerformanceController';
import type { AnalyzerFrameProvider, VisualizerModeId, VisualizerPerformanceProfile, VisualizerSettings } from './types';

/** Chrome storage key for visualizer settings. */
export const VISUALIZER_STORAGE_KEY = 'sheynfx.visualizer.v1';

const VALID_MODES: readonly VisualizerModeId[] = [
  'spectrumBars',
  'circularSpectrum',
  'bassRing',
  'particles',
  'aurora',
  'galaxy',
  'waveform'
] as const;

/** Owns visualizer engine lifecycle and settings persistence. */
export class VisualizerManager {
  private engine: VisualizerEngine | null = null;
  private settings: VisualizerSettings = DEFAULT_VISUALIZER_SETTINGS;

  /** Creates a manager with injectable storage for tests. */
  constructor(
    private readonly storage: LocalStorageArea = localStorageArea,
    private readonly storageKey = VISUALIZER_STORAGE_KEY
  ) {}

  /** Loads settings, creates the engine, and starts it when enabled. */
  async attach(canvas: HTMLCanvasElement, analyzerProvider: AnalyzerFrameProvider): Promise<VisualizerSettings> {
    this.settings = await this.loadSettings();
    this.engine?.dispose();
    this.engine = new VisualizerEngine(canvas, analyzerProvider, this.settings);
    return this.getSettings();
  }

  /** Switches profile at runtime and persists the setting. */
  async setProfile(profile: VisualizerPerformanceProfile): Promise<VisualizerSettings> {
    const engine = this.getEngine();
    this.settings = engine.setProfile(profile);
    await this.saveSettings(this.settings);
    return this.getSettings();
  }

  /** Switches active modes at runtime and persists the setting. */
  async setModes(modes: readonly VisualizerModeId[]): Promise<VisualizerSettings> {
    const engine = this.getEngine();
    this.settings = engine.setModes(modes);
    await this.saveSettings(this.settings);
    return this.getSettings();
  }

  /** Enables or disables rendering and persists the setting. */
  async setEnabled(enabled: boolean): Promise<VisualizerSettings> {
    const engine = this.getEngine();
    this.settings = engine.setEnabled(enabled);
    await this.saveSettings(this.settings);
    return this.getSettings();
  }

  /** Stops rendering without disposing the engine. */
  stop(): void {
    this.engine?.stop();
  }

  /** Starts rendering when attached and enabled. */
  start(): void {
    this.engine?.start();
  }

  /** Returns cloned visualizer settings. */
  getSettings(): VisualizerSettings {
    return {
      ...this.settings,
      modes: [...this.settings.modes]
    };
  }

  /** Disposes the engine and releases rendering resources. */
  dispose(): void {
    this.engine?.dispose();
    this.engine = null;
  }

  private async loadSettings(): Promise<VisualizerSettings> {
    const storedSettings = await this.storage.get<Partial<VisualizerSettings>>(this.storageKey);
    return this.sanitizeSettings(storedSettings);
  }

  private async saveSettings(settings: VisualizerSettings): Promise<void> {
    await this.storage.set(this.storageKey, this.sanitizeSettings(settings));
  }

  private sanitizeSettings(settings: Partial<VisualizerSettings> | undefined): VisualizerSettings {
    const profile = this.sanitizeProfile(settings?.profile);
    const modes = this.sanitizeModes(settings?.modes);
    return {
      profile,
      modes,
      enabled: settings?.enabled ?? DEFAULT_VISUALIZER_SETTINGS.enabled
    };
  }

  private sanitizeProfile(profile: VisualizerPerformanceProfile | undefined): VisualizerPerformanceProfile {
    return profile && VISUALIZER_PROFILES[profile] ? profile : DEFAULT_VISUALIZER_SETTINGS.profile;
  }

  private sanitizeModes(modes: readonly VisualizerModeId[] | undefined): readonly VisualizerModeId[] {
    const validModes = modes?.filter((mode) => VALID_MODES.includes(mode)) ?? [];
    return validModes.length > 0 ? validModes : DEFAULT_VISUALIZER_SETTINGS.modes;
  }

  private getEngine(): VisualizerEngine {
    if (!this.engine) {
      throw new Error('VisualizerManager is not attached to a canvas.');
    }

    return this.engine;
  }
}
