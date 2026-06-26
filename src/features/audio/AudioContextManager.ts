import type { AudioContextFactory, AudioEngineStatus } from './types';

function createBrowserAudioContext(): AudioContext {
  const AudioContextConstructor = window.AudioContext ?? window.webkitAudioContext;

  if (!AudioContextConstructor) {
    throw new Error('Web Audio API is not supported in this browser.');
  }

  return new AudioContextConstructor();
}

/** Manages the singleton lifecycle of the browser AudioContext. */
export class AudioContextManager {
  private static instance: AudioContextManager | null = null;
  private context: AudioContext | null = null;
  private isDisposed = false;

  private constructor(private readonly contextFactory: AudioContextFactory) {}

  /** Returns the shared AudioContextManager instance. */
  static getInstance(contextFactory: AudioContextFactory = createBrowserAudioContext): AudioContextManager {
    if (!AudioContextManager.instance || AudioContextManager.instance.isDisposed) {
      AudioContextManager.instance = new AudioContextManager(contextFactory);
    }

    return AudioContextManager.instance;
  }

  /** Clears the singleton, disposing the active AudioContext when present. */
  static async disposeInstance(): Promise<void> {
    await AudioContextManager.instance?.dispose();
    AudioContextManager.instance = null;
  }

  /** Lazily creates and returns the managed AudioContext. */
  getContext(): AudioContext {
    if (this.isDisposed) {
      throw new Error('AudioContextManager has been disposed.');
    }

    if (!this.context) {
      this.context = this.contextFactory();
    }

    return this.context;
  }

  /** Resumes the managed AudioContext when it is suspended. */
  async resume(): Promise<AudioEngineStatus> {
    const context = this.getContext();

    if (context.state === 'suspended') {
      await context.resume();
    }

    return this.getStatus();
  }

  /** Suspends the managed AudioContext when it is running. */
  async suspend(): Promise<AudioEngineStatus> {
    if (!this.context || this.context.state !== 'running') {
      return this.getStatus();
    }

    await this.context.suspend();
    return this.getStatus();
  }

  /** Returns the current managed context status without forcing initialization. */
  getStatus(): AudioEngineStatus {
    if (this.isDisposed) {
      return 'disposed';
    }

    if (!this.context) {
      return 'idle';
    }

    return this.context.state === 'running' ? 'running' : 'suspended';
  }

  /** Safely closes the managed AudioContext and prevents further use. */
  async dispose(): Promise<void> {
    if (this.isDisposed) {
      return;
    }

    const context = this.context;
    this.context = null;
    this.isDisposed = true;

    if (context && context.state !== 'closed') {
      await context.close();
    }
  }
}
