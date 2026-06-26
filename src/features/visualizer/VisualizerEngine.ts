import type { AnalyzerFrame } from '../audio/types';
import { FrameScheduler } from './FrameScheduler';
import { Aurora } from './Modes/Aurora';
import { BassRing } from './Modes/BassRing';
import { CircularSpectrum } from './Modes/CircularSpectrum';
import { Galaxy } from './Modes/Galaxy';
import { Particles } from './Modes/Particles';
import { SpectrumBars } from './Modes/SpectrumBars';
import { Waveform } from './Modes/Waveform';
import { PerformanceController, VISUALIZER_PROFILES } from './PerformanceController';
import { Renderer } from './Renderer';
import type {
  AnalyzerFrameProvider,
  VisualizerFrame,
  VisualizerMode,
  VisualizerModeId,
  VisualizerPerformanceProfile,
  VisualizerSettings
} from './types';

const DEFAULT_ANALYZER_FRAME: AnalyzerFrame = {
  fft: new Uint8Array(64),
  timeDomain: new Uint8Array(128).fill(128),
  rms: 0,
  peak: 0,
  bassEnergy: 0,
  midEnergy: 0,
  trebleEnergy: 0
};

/** Default visualizer settings for a balanced popup experience. */
export const DEFAULT_VISUALIZER_SETTINGS: VisualizerSettings = {
  profile: 'balanced',
  modes: ['circularSpectrum', 'bassRing', 'waveform'],
  enabled: true
};

/** Production visualizer engine driven by AudioAnalyzer frames. */
export class VisualizerEngine {
  private readonly performanceController: PerformanceController;
  private readonly renderer: Renderer;
  private readonly scheduler: FrameScheduler;
  private readonly modes = new Map<VisualizerModeId, VisualizerMode>();
  private settings: VisualizerSettings;
  private analyzerFrame: AnalyzerFrame = DEFAULT_ANALYZER_FRAME;
  private analyzerTick = 0;
  private visible = true;
  private isDisposed = false;
  private intersectionObserver: IntersectionObserver | null = null;

  /** Creates a visualizer engine for a canvas and analyzer frame provider. */
  constructor(
    canvas: HTMLCanvasElement,
    private readonly analyzerProvider: AnalyzerFrameProvider,
    settings: Partial<VisualizerSettings> = {}
  ) {
    this.settings = this.mergeSettings(settings);
    this.performanceController = new PerformanceController(this.settings.profile);
    this.renderer = new Renderer(canvas, this.performanceController.getProfile());
    this.createModes();
    this.scheduler = new FrameScheduler(this.performanceController.getProfile().targetFps, this.renderFrame);
    this.observeCanvasVisibility(canvas);

    if (this.settings.enabled) {
      this.start();
    }
  }

  /** Starts rendering when enabled and visible. */
  start(): void {
    this.assertActive();
    if (this.settings.enabled && this.visible) {
      this.scheduler.start();
    }
  }

  /** Stops rendering without disposing resources. */
  stop(): void {
    this.assertActive();
    this.scheduler.stop();
  }

  /** Enables or disables rendering at runtime. */
  setEnabled(enabled: boolean): VisualizerSettings {
    this.assertActive();
    this.settings = { ...this.settings, enabled };
    if (enabled) {
      this.start();
    } else {
      this.stop();
    }
    return this.getSettings();
  }

  /** Switches performance profile at runtime without restarting. */
  setProfile(profile: VisualizerPerformanceProfile): VisualizerSettings {
    this.assertActive();
    this.performanceController.setProfile(profile);
    this.renderer.setProfile(this.performanceController.getProfile());
    this.scheduler.setTargetFps(this.performanceController.getProfile().targetFps);
    this.settings = { ...this.settings, profile };
    return this.getSettings();
  }

  /** Switches active visualizer modes at runtime. */
  setModes(modes: readonly VisualizerModeId[]): VisualizerSettings {
    this.assertActive();
    this.settings = { ...this.settings, modes: [...modes] };
    return this.getSettings();
  }

  /** Returns cloned visualizer settings. */
  getSettings(): VisualizerSettings {
    return {
      ...this.settings,
      modes: [...this.settings.modes]
    };
  }

  /** Releases scheduler, renderer, observers, and mode resources. */
  dispose(): void {
    if (this.isDisposed) {
      return;
    }

    this.scheduler.dispose();
    this.intersectionObserver?.disconnect();
    this.intersectionObserver = null;
    this.modes.forEach((mode) => {
      mode.dispose();
    });
    this.modes.clear();
    this.renderer.dispose();
    this.isDisposed = true;
  }

  private readonly renderFrame = (timestamp: number, deltaSeconds: number) => {
    if (!this.visible || !this.settings.enabled) {
      return;
    }

    const renderStart = performance.now();
    const profile = this.performanceController.getProfile();
    this.scheduler.setTargetFps(profile.targetFps);
    this.refreshAnalyzerFrame(profile.analyzerRefreshInterval);
    const frame = this.performanceController.createFrame(this.analyzerFrame, timestamp, deltaSeconds);
    this.draw(frame);
    this.performanceController.recordFrameCost(performance.now() - renderStart);

    if (this.performanceController.getProfile().id !== this.settings.profile) {
      this.settings = { ...this.settings, profile: this.performanceController.getProfile().id };
      this.renderer.setProfile(this.performanceController.getProfile());
    }
  };

  private draw(frame: VisualizerFrame): void {
    const profile = this.performanceController.getProfile();
    const clearAlpha = profile.id === 'ultraPerformance' ? 1 : 0.2;
    this.renderer.resize();
    this.renderer.clear(clearAlpha);
    const renderContext = this.renderer.getRenderContext();
    const activeModes = this.performanceController.filterModes(this.settings.modes);

    if (activeModes.length === 0) {
      this.modes.get('spectrumBars')?.render(frame, renderContext);
      return;
    }

    activeModes.forEach((modeId) => {
      this.modes.get(modeId)?.render(frame, renderContext);
    });
  }

  private refreshAnalyzerFrame(refreshInterval: number): void {
    if (this.analyzerTick % refreshInterval === 0) {
      this.analyzerFrame = this.analyzerProvider();
    }
    this.analyzerTick = (this.analyzerTick + 1) % Number.MAX_SAFE_INTEGER;
  }

  private createModes(): void {
    const modes: readonly VisualizerMode[] = [
      new SpectrumBars(),
      new CircularSpectrum(),
      new BassRing(),
      new Particles(),
      new Aurora(),
      new Galaxy(),
      new Waveform()
    ];

    modes.forEach((mode) => {
      this.modes.set(mode.id, mode);
    });
  }

  private observeCanvasVisibility(canvas: HTMLCanvasElement): void {
    if (typeof IntersectionObserver === 'undefined') {
      this.visible = true;
      return;
    }

    this.intersectionObserver = new IntersectionObserver((entries) => {
      const entry = entries[0];
      this.visible = Boolean(entry?.isIntersecting);

      if (this.visible) {
        this.start();
      } else {
        this.scheduler.stop();
      }
    });
    this.intersectionObserver.observe(canvas);
  }

  private mergeSettings(settings: Partial<VisualizerSettings>): VisualizerSettings {
    const profile = settings.profile && VISUALIZER_PROFILES[settings.profile] ? settings.profile : DEFAULT_VISUALIZER_SETTINGS.profile;
    return {
      profile,
      modes: settings.modes?.length ? [...settings.modes] : [...DEFAULT_VISUALIZER_SETTINGS.modes],
      enabled: settings.enabled ?? DEFAULT_VISUALIZER_SETTINGS.enabled
    };
  }

  private assertActive(): void {
    if (this.isDisposed) {
      throw new Error('VisualizerEngine has been disposed.');
    }
  }
}
