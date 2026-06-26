import { AudioContextManager } from '../features/audio/AudioContextManager';
import { AudioGraph } from '../features/audio/AudioGraph';
import { EQUALIZER_BANDS } from '../features/audio/constants';
import type { AnalyzerFrame, EqualizerBandFrequency } from '../features/audio/types';
import type { EffectsSettings } from '../features/audio/effects';
import { loadAlphaSettings, sanitizeAlphaSettings } from '../features/integration/alphaSettingsStore';
import type {
  SerializableAnalyzerFrame,
  SheynFxAlphaSettings,
  SheynFxCommand,
  SheynFxCommandResponse,
  SheynFxTabStatus
} from '../features/integration/types';
import { SHEYNFX_ALPHA_SETTINGS_KEY } from '../features/integration/types';

const MEDIA_SELECTOR = 'audio, video';
const MEDIA_READY_EVENTS: readonly string[] = ['play', 'playing', 'loadedmetadata', 'loadeddata', 'canplay', 'durationchange', 'emptied'] as const;


interface PageHookStatus {
  injected: boolean;
  capturedConnectionCount: number;
  contextCount: number;
  lastError: string;
  frame: SerializableAnalyzerFrame;
}

interface SheynFxWindowMessage {
  type?: string;
  status?: Partial<PageHookStatus>;
}

const EMPTY_ANALYZER_FRAME: SerializableAnalyzerFrame = {
  fft: Array.from({ length: 64 }, () => 0),
  timeDomain: Array.from({ length: 128 }, () => 128),
  rms: 0,
  peak: 0,
  bassEnergy: 0,
  midEnergy: 0,
  trebleEnergy: 0
};

function normalizeHookFrame(frame: Partial<SerializableAnalyzerFrame> | undefined): SerializableAnalyzerFrame {
  return {
    fft: Array.isArray(frame?.fft) ? frame.fft.map(Number).slice(0, 64) : EMPTY_ANALYZER_FRAME.fft,
    timeDomain: Array.isArray(frame?.timeDomain) ? frame.timeDomain.map(Number).slice(0, 128) : EMPTY_ANALYZER_FRAME.timeDomain,
    rms: typeof frame?.rms === 'number' ? frame.rms : 0,
    peak: typeof frame?.peak === 'number' ? frame.peak : 0,
    bassEnergy: typeof frame?.bassEnergy === 'number' ? frame.bassEnergy : 0,
    midEnergy: typeof frame?.midEnergy === 'number' ? frame.midEnergy : 0,
    trebleEnergy: typeof frame?.trebleEnergy === 'number' ? frame.trebleEnergy : 0
  };
}

function isWindowMessage(value: unknown): value is SheynFxWindowMessage {
  return Boolean(value && typeof value === 'object' && 'type' in value);
}

class PageMediaController {
  private readonly contextManager = AudioContextManager.getInstance();
  private readonly graphs = new Map<HTMLMediaElement, AudioGraph>();
  private readonly knownMedia = new Set<HTMLMediaElement>();
  private readonly originalPlaybackRates = new Map<HTMLMediaElement, number>();
  private settings: SheynFxAlphaSettings | null = null;
  private mutationObserver: MutationObserver | null = null;
  private lastUrl = window.location.href;
  private routeScanTimer = 0;
  private routeScanInterval = 0;
  private readonly observedRoots = new WeakSet<Document | ShadowRoot>();
  private pageHookInjected = false;
  private pageHookStatus: PageHookStatus | null = null;

  async initialize(): Promise<void> {
    this.injectPageHook();
    window.addEventListener('message', this.handlePageHookMessage);
    this.settings = await loadAlphaSettings();
    this.sendSettingsToPageHook();
    this.observeMedia();
    this.scanMedia();
    this.applyCurrentSettings();
  }

  handleCommand(command: SheynFxCommand): SheynFxCommandResponse {
    try {
      if (!this.settings) {
        return { ok: false, error: 'SheynEQ is not initialized.' };
      }

      switch (command.type) {
        case 'SHEYNFX_GET_STATUS':
          this.requestPageHookStatus();
          this.scanMedia();
          this.disconnectDetachedMedia();
          return { ok: true, status: this.getStatus() };
        case 'SHEYNFX_APPLY_SETTINGS':
          this.settings = command.settings;
          this.sendSettingsToPageHook();
          this.applyCurrentSettings();
          return { ok: true, status: this.getStatus() };
        case 'SHEYNFX_SET_ENABLED':
          this.settings = { ...this.settings, enabled: command.enabled };
          this.sendSettingsToPageHook();
          this.applyCurrentSettings();
          return { ok: true, status: this.getStatus() };
        case 'SHEYNFX_SET_EQ_BAND':
          this.settings.audio.equalizer[command.frequency] = command.gainDb;
          if (this.settings.enabled) {
            this.graphs.forEach((graph) => {
              graph.getEqualizer().setBandGain(command.frequency, command.gainDb);
            });
          }
          return { ok: true, status: this.getStatus() };
        case 'SHEYNFX_SET_BASS_BOOST':
          this.settings.effects.bassBoost = {
            ...this.settings.effects.bassBoost,
            enabled: command.enabled,
            amount: command.amount
          };
          this.applyEffects();
          this.sendSettingsToPageHook();
          return { ok: true, status: this.getStatus() };
        case 'SHEYNFX_UPDATE_EFFECT':
          switch (command.effectId) {
            case 'bassBoost':
              this.settings.effects.bassBoost = { ...this.settings.effects.bassBoost, ...command.parameters };
              break;
            case 'reverb':
              this.settings.effects.reverb = { ...this.settings.effects.reverb, ...command.parameters };
              break;
          }
          this.applyEffects();
          this.sendSettingsToPageHook();
          return { ok: true, status: this.getStatus() };
        case 'SHEYNFX_UPDATE_SLOWED_REVERB':
          this.settings.effects.slowedReverb = { ...this.settings.effects.slowedReverb, ...command.parameters };
          this.applyEffects();
          this.applySlowedPlayback();
          this.sendSettingsToPageHook();
          return { ok: true, status: this.getStatus() };
        case 'SHEYNFX_UPDATE_NIGHTCORE':
          this.settings.effects.nightcore = { ...this.settings.effects.nightcore, ...command.parameters };
          this.applyPlaybackRate();
          this.sendSettingsToPageHook();
          return { ok: true, status: this.getStatus() };
        case 'SHEYNFX_UPDATE_SPEED':
          this.settings.effects.speed = { ...this.settings.effects.speed, ...command.parameters };
          this.applyPlaybackRate();
          this.sendSettingsToPageHook();
          return { ok: true, status: this.getStatus() };
        case 'SHEYNFX_UPDATE_PITCH':
          this.settings.effects.pitch = { ...this.settings.effects.pitch, ...command.parameters };
          this.sendSettingsToPageHook();
          return { ok: true, status: this.getStatus() };
      }
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'SheynEQ command failed.'
      };
    }
  }

  getStatus(): SheynFxTabStatus {
    const analyzerFrame = this.captureAnalyzerFrame();
    const detectedMediaCount = this.getConnectedMedia().length + this.getHookDetectedCount();
    const attachedMediaCount = this.graphs.size + this.getHookAttachedCount();
    const serializedFrame = this.pageHookStatus?.frame ?? this.serializeAnalyzerFrame(analyzerFrame);
    const outputLevel = Math.max(analyzerFrame.rms, analyzerFrame.peak, serializedFrame.rms, serializedFrame.peak);

    return {
      detectedMediaCount,
      attachedMediaCount,
      enabled: Boolean(this.settings?.enabled),
      outputLevel,
      message: this.getStatusMessage(detectedMediaCount, attachedMediaCount),
      analyzerFrame: outputLevel > 0 ? serializedFrame : this.serializeAnalyzerFrame(analyzerFrame)
    };
  }

  private injectPageHook(): void {
    if (this.pageHookInjected) {
      return;
    }

    this.pageHookInjected = true;
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('sheynfx-page-hook.js');
    script.async = false;
    script.onload = () => script.remove();
    script.onerror = () => {
      this.pageHookStatus = {
        injected: false,
        capturedConnectionCount: 0,
        contextCount: 0,
        lastError: 'Failed to inject page hook.',
        frame: EMPTY_ANALYZER_FRAME
      };
      script.remove();
    };
    (document.documentElement || document.head).append(script);
  }

  private sendSettingsToPageHook(): void {
    window.postMessage({ type: 'SHEYNFX_PAGE_SETTINGS', settings: this.settings }, '*');
  }

  private requestPageHookStatus(): void {
    window.postMessage({ type: 'SHEYNFX_PAGE_GET_STATUS' }, '*');
  }

  private readonly handlePageHookMessage = (event: MessageEvent<unknown>): void => {
    if (event.source !== window || !isWindowMessage(event.data)) {
      return;
    }

    if (event.data.type !== 'SHEYNFX_PAGE_HOOK_READY' && event.data.type !== 'SHEYNFX_PAGE_STATUS') {
      return;
    }

    const status = event.data.status ?? {};
    this.pageHookStatus = {
      injected: Boolean(status.injected),
      capturedConnectionCount: typeof status.capturedConnectionCount === 'number' ? status.capturedConnectionCount : 0,
      contextCount: typeof status.contextCount === 'number' ? status.contextCount : 0,
      lastError: typeof status.lastError === 'string' ? status.lastError : '',
      frame: normalizeHookFrame(status.frame)
    };
  };

  private getHookDetectedCount(): number {
    return Math.max(this.pageHookStatus?.contextCount ?? 0, this.pageHookStatus?.capturedConnectionCount ?? 0);
  }

  private getHookAttachedCount(): number {
    return this.pageHookStatus && this.pageHookStatus.capturedConnectionCount > 0 ? 1 : 0;
  }

  private observeMedia(): void {
    this.mutationObserver = new MutationObserver((mutations) => {
      this.observeDiscoveredShadowRoots(mutations);
      this.scheduleScan();
    });
    this.observeRoot(document);
    MEDIA_READY_EVENTS.forEach((eventName) => {
      document.addEventListener(eventName, this.handleMediaEvent, true);
    });
    document.addEventListener('visibilitychange', this.scheduleScan, true);
    window.addEventListener('focus', this.scheduleScan);
    window.addEventListener('popstate', this.scheduleScan);
    window.addEventListener('hashchange', this.scheduleScan);
    window.addEventListener('pageshow', this.scheduleScan);
    window.addEventListener('pagehide', this.dispose);
    chrome.storage?.onChanged.addListener(this.handleStorageChanged);
    this.routeScanInterval = window.setInterval(() => {
      if (window.location.href !== this.lastUrl) {
        this.lastUrl = window.location.href;
        this.scheduleScan();
      }
    }, 1200);
  }

  private scanMedia(): void {
    this.requestPageHookStatus();
    this.findMediaElements().forEach((mediaElement) => {
      this.knownMedia.add(mediaElement);

      MEDIA_READY_EVENTS.forEach((eventName) => {
        mediaElement.removeEventListener(eventName, this.scheduleScan);
        mediaElement.addEventListener(eventName, this.scheduleScan, { passive: true });
      });

      if (this.settings?.enabled && !this.graphs.has(mediaElement)) {
        this.attachMedia(mediaElement);
      }
    });
  }

  private findMediaElements(): HTMLMediaElement[] {
    const mediaElements = new Set<HTMLMediaElement>();
    this.collectMediaElements(document, mediaElements);
    return [...mediaElements];
  }

  private collectMediaElements(root: Document | ShadowRoot, mediaElements: Set<HTMLMediaElement>): void {
    root.querySelectorAll<HTMLMediaElement>(MEDIA_SELECTOR).forEach((mediaElement) => {
      mediaElements.add(mediaElement);
    });

    root.querySelectorAll<HTMLElement>('*').forEach((element) => {
      if (element.shadowRoot) {
        this.observeRoot(element.shadowRoot);
        this.collectMediaElements(element.shadowRoot, mediaElements);
      }
    });
  }

  private observeRoot(root: Document | ShadowRoot): void {
    if (this.observedRoots.has(root) || !this.mutationObserver) {
      return;
    }

    this.observedRoots.add(root);
    const target = root instanceof Document ? root.documentElement : root;
    this.mutationObserver.observe(target, {
      attributes: true,
      attributeFilter: ['src', 'href'],
      childList: true,
      subtree: true
    });
  }

  private observeDiscoveredShadowRoots(mutations: readonly MutationRecord[]): void {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node instanceof HTMLElement && node.shadowRoot) {
          this.observeRoot(node.shadowRoot);
        }
      });
    });
  }

  private scheduleScan = (): void => {
    window.clearTimeout(this.routeScanTimer);
    this.routeScanTimer = window.setTimeout(() => {
      this.scanMedia();
      this.disconnectDetachedMedia();
    }, 120);
  };

  private attachMedia(mediaElement: HTMLMediaElement): void {
    if (this.graphs.has(mediaElement) || !this.settings) {
      return;
    }

    let graph: AudioGraph | null = null;

    try {
      if (!this.settings.enabled) {
        return;
      }

      graph = new AudioGraph(this.contextManager.getContext());
      graph.connectMediaElement(mediaElement);
      graph.applySettings(this.settings.audio);
      graph.applyEffectsSettings(this.createEffectiveEffectsSettings());
      this.graphs.set(mediaElement, graph);
      this.rememberPlaybackRate(mediaElement);
      this.applySlowedPlaybackToMedia(mediaElement);
      mediaElement.addEventListener('play', this.resumeAudio, { passive: true });
      void this.contextManager.resume();
    } catch (error) {
      console.error('[SheynEQ] Audio attach failed:', error);
      graph?.dispose();
      this.graphs.delete(mediaElement);
    }
  }

  private applyCurrentSettings(): void {
    const settings = this.settings;
    this.sendSettingsToPageHook();

    if (!settings) {
      return;
    }

    if (!settings.enabled) {
      this.applyBypassProcessing();
      this.applySlowedPlayback();
      return;
    }

    this.scanMedia();
    this.graphs.forEach((graph) => {
      graph.applySettings(settings.audio);
      graph.applyEffectsSettings(this.createEffectiveEffectsSettings());
    });
    this.applySlowedPlayback();
  }

  private applyEffects(): void {
    if (!this.settings) {
      return;
    }

    this.graphs.forEach((graph) => {
      graph.applyEffectsSettings(this.settings?.enabled ? this.createEffectiveEffectsSettings() : this.createBypassEffectsSettings());
    });
  }

  private applyBypassProcessing(): void {
    this.graphs.forEach((graph) => {
      graph.applySettings({
        masterGain: 1,
        pan: 0,
        presetName: 'Flat',
        equalizer: EQUALIZER_BANDS.reduce<Record<EqualizerBandFrequency, number>>((equalizer, frequency) => {
          equalizer[frequency] = 0;
          return equalizer;
        }, {} as Record<EqualizerBandFrequency, number>)
      });
      graph.applyEffectsSettings(this.createBypassEffectsSettings());
    });
  }

  private createBypassEffectsSettings(): EffectsSettings {
    return {
      bassBoost: { enabled: false, amount: 0, frequency: 95 },
      reverb: { enabled: false, mix: 0, decay: 1.4, dampening: 0.35 },
      slowedReverb: { enabled: false, amount: 0, speed: 0.85, preservePitch: true },
      nightcore: { enabled: false, amount: 0, speed: 1.15 },
      speed: { enabled: false, rate: 1 },
      pitch: { enabled: false, semitones: 0 }
    };
  }

  private createEffectiveEffectsSettings(): EffectsSettings {
    if (!this.settings?.enabled) {
      return this.createBypassEffectsSettings();
    }

    const effects = this.settings.effects;
    const slowedReverb = effects.slowedReverb;
    const slowedMix = slowedReverb.enabled ? 0.2 + slowedReverb.amount * 0.36 : 0;

    return {
      ...effects,
      reverb: {
        ...effects.reverb,
        enabled: effects.reverb.enabled || slowedReverb.enabled,
        mix: Math.max(effects.reverb.enabled ? effects.reverb.mix : 0, slowedMix),
        decay: slowedReverb.enabled ? Math.max(effects.reverb.decay, 2.2 + slowedReverb.amount * 1.6) : effects.reverb.decay,
        dampening: slowedReverb.enabled ? Math.max(effects.reverb.dampening, 0.38) : effects.reverb.dampening
      }
    };
  }

  private applySlowedPlayback(): void {
    this.applyPlaybackRate();
  }

  private applyPlaybackRate(): void {
    this.graphs.forEach((_graph, mediaElement) => {
      this.applyPlaybackRateToMedia(mediaElement);
    });
  }

  private applySlowedPlaybackToMedia(mediaElement: HTMLMediaElement): void {
    this.applyPlaybackRateToMedia(mediaElement);
  }

  private applyPlaybackRateToMedia(mediaElement: HTMLMediaElement): void {
    this.rememberPlaybackRate(mediaElement);
    const originalRate = this.originalPlaybackRates.get(mediaElement) ?? 1;
    const playback = this.getPlaybackEffect();

    mediaElement.playbackRate = playback ? playback.rate : originalRate;
    this.setPitchPreservation(mediaElement, playback?.preservePitch ?? true);
  }

  private getPlaybackEffect(): { rate: number; preservePitch: boolean } | null {
    if (!this.settings?.enabled) {
      return null;
    }

    const { slowedReverb, nightcore, speed } = this.settings.effects;

    if (speed.enabled) {
      return { rate: this.clamp(speed.rate, 0.5, 1.5), preservePitch: true };
    }

    if (nightcore.enabled) {
      return { rate: this.clamp(nightcore.speed, 1, 1.5), preservePitch: false };
    }

    if (slowedReverb.enabled) {
      return { rate: this.clamp(slowedReverb.speed, 0.5, 1), preservePitch: slowedReverb.preservePitch };
    }

    return null;
  }

  private setPitchPreservation(mediaElement: HTMLMediaElement, preservePitch: boolean): void {
    const pitchMedia = mediaElement as HTMLMediaElement & {
      preservesPitch?: boolean;
      mozPreservesPitch?: boolean;
      webkitPreservesPitch?: boolean;
    };

    if ('preservesPitch' in pitchMedia) {
      pitchMedia.preservesPitch = preservePitch;
    }
    if ('mozPreservesPitch' in pitchMedia) {
      pitchMedia.mozPreservesPitch = preservePitch;
    }
    if ('webkitPreservesPitch' in pitchMedia) {
      pitchMedia.webkitPreservesPitch = preservePitch;
    }
  }

  private clamp(value: number, min: number, max: number): number {
    if (!Number.isFinite(value)) {
      return min;
    }

    return Math.min(Math.max(value, min), max);
  }

  private rememberPlaybackRate(mediaElement: HTMLMediaElement): void {
    if (!this.originalPlaybackRates.has(mediaElement)) {
      this.originalPlaybackRates.set(mediaElement, mediaElement.playbackRate || 1);
    }
  }

  private restorePlaybackRate(mediaElement: HTMLMediaElement): void {
    const originalRate = this.originalPlaybackRates.get(mediaElement);
    if (typeof originalRate === 'number') {
      mediaElement.playbackRate = originalRate;
    }
    this.originalPlaybackRates.delete(mediaElement);
  }

  private captureAnalyzerFrame(): AnalyzerFrame {
    const activeGraph = this.findActiveGraph();
    if (activeGraph) {
      return activeGraph.analyze();
    }

    return {
      fft: new Uint8Array(64),
      timeDomain: new Uint8Array(128).fill(128),
      rms: 0,
      peak: 0,
      bassEnergy: 0,
      midEnergy: 0,
      trebleEnergy: 0
    };
  }

  private findActiveGraph(): AudioGraph | null {
    for (const [mediaElement, graph] of this.graphs.entries()) {
      if (!mediaElement.paused && !mediaElement.ended) {
        return graph;
      }
    }

    return this.graphs.values().next().value ?? null;
  }

  private disconnectDetachedMedia(): void {
    for (const [mediaElement, graph] of this.graphs.entries()) {
      if (!mediaElement.isConnected) {
        mediaElement.removeEventListener('play', this.resumeAudio);
        this.restorePlaybackRate(mediaElement);
        graph.dispose();
        this.graphs.delete(mediaElement);
      }
    }

    for (const mediaElement of this.knownMedia) {
      if (!mediaElement.isConnected) {
        this.knownMedia.delete(mediaElement);
        this.originalPlaybackRates.delete(mediaElement);
      }
    }
  }

  private disconnectAllMedia(): void {
    this.graphs.forEach((graph, mediaElement) => {
      mediaElement.removeEventListener('play', this.resumeAudio);
      this.restorePlaybackRate(mediaElement);
      graph.dispose();
    });
    this.graphs.clear();
    this.originalPlaybackRates.clear();
  }

  private getConnectedMedia(): HTMLMediaElement[] {
    this.scanMedia();
    return [...this.knownMedia].filter((mediaElement) => mediaElement.isConnected);
  }

  private isMediaCandidate(mediaElement: HTMLMediaElement): boolean {
    return Boolean(
      !mediaElement.paused ||
        mediaElement.currentTime > 0 ||
      mediaElement.currentSrc ||
        mediaElement.src ||
        mediaElement.srcObject ||
        mediaElement.networkState !== HTMLMediaElement.NETWORK_EMPTY ||
        mediaElement.readyState > HTMLMediaElement.HAVE_NOTHING ||
        mediaElement.querySelector('source')
    );
  }

  private getStatusMessage(detectedMediaCount: number, attachedMediaCount: number): string {
    if (this.pageHookStatus?.lastError) {
      return `Web Audio hook error: ${this.pageHookStatus.lastError}`;
    }

    if (detectedMediaCount === 0) {
      return this.pageHookInjected ? 'Waiting for page Web Audio playback.' : 'SheynEQ page hook is not injected.';
    }

    if (!this.settings?.enabled) {
      return 'Audio source found. Enable SheynEQ to process playback.';
    }

    if (attachedMediaCount === 0) {
      return 'Audio source found, waiting for playback access.';
    }

    return this.graphs.size > 0 ? 'HTML5 audio graph attached.' : 'Page Web Audio graph attached.';
  }

  private serializeAnalyzerFrame(frame: AnalyzerFrame): SerializableAnalyzerFrame {
    return {
      fft: [...frame.fft],
      timeDomain: [...frame.timeDomain],
      rms: frame.rms,
      peak: frame.peak,
      bassEnergy: frame.bassEnergy,
      midEnergy: frame.midEnergy,
      trebleEnergy: frame.trebleEnergy
    };
  }

  private readonly resumeAudio = () => {
    void this.contextManager.resume();
  };

  private getMediaElementFromEvent(event: Event): HTMLMediaElement | null {
    const mediaElement = event.composedPath().find((target): target is HTMLMediaElement => target instanceof HTMLMediaElement);
    return mediaElement ?? (event.target instanceof HTMLMediaElement ? event.target : null);
  }

  private readonly handleMediaEvent = (event: Event) => {
    const mediaElement = this.getMediaElementFromEvent(event);
    if (!mediaElement) {
      return;
    }

    this.knownMedia.add(mediaElement);
    if (this.settings?.enabled && this.isMediaCandidate(mediaElement)) {
      this.attachMedia(mediaElement);
    }
  };

  private readonly dispose = () => {
    this.disconnectAllMedia();
    void AudioContextManager.disposeInstance();
    this.mutationObserver?.disconnect();
    this.mutationObserver = null;
    window.clearTimeout(this.routeScanTimer);
    window.clearInterval(this.routeScanInterval);
    MEDIA_READY_EVENTS.forEach((eventName) => {
      document.removeEventListener(eventName, this.handleMediaEvent, true);
    });
    document.removeEventListener('visibilitychange', this.scheduleScan, true);
    window.removeEventListener('focus', this.scheduleScan);
    window.removeEventListener('popstate', this.scheduleScan);
    window.removeEventListener('hashchange', this.scheduleScan);
    window.removeEventListener('pageshow', this.scheduleScan);
    window.removeEventListener('pagehide', this.dispose);
    chrome.storage?.onChanged.removeListener(this.handleStorageChanged);
    window.removeEventListener('message', this.handlePageHookMessage);
  };

  private readonly handleStorageChanged = (changes: Record<string, chrome.storage.StorageChange>, areaName: string) => {
    if (areaName !== 'local' || !changes[SHEYNFX_ALPHA_SETTINGS_KEY]) {
      return;
    }

    this.settings = sanitizeAlphaSettings(changes[SHEYNFX_ALPHA_SETTINGS_KEY].newValue as Partial<SheynFxAlphaSettings> | undefined);
    this.sendSettingsToPageHook();
    this.applyCurrentSettings();
  };
}

const controller = new PageMediaController();
void controller.initialize();

chrome.runtime.onMessage.addListener((message: SheynFxCommand, _sender, sendResponse: (response: SheynFxCommandResponse) => void) => {
  sendResponse(controller.handleCommand(message));
  return false;
});
