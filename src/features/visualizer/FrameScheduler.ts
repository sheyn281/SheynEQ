import type { ScheduledFrameCallback } from './types';

/** requestAnimationFrame scheduler with visibility-aware FPS limiting. */
export class FrameScheduler {
  private animationFrameId = 0;
  private running = false;
  private visible = true;
  private lastFrameTimestamp = 0;
  private minFrameIntervalMs: number;
  private readonly handleVisibilityChange = () => {
    this.visible = document.visibilityState !== 'hidden';
    if (this.visible) {
      this.lastFrameTimestamp = 0;
    }
  };

  /** Creates a scheduler for a target frame rate. */
  constructor(
    targetFps: number,
    private readonly callback: ScheduledFrameCallback
  ) {
    this.minFrameIntervalMs = 1000 / targetFps;
    document.addEventListener('visibilitychange', this.handleVisibilityChange);
    this.handleVisibilityChange();
  }

  /** Updates the FPS limit at runtime. */
  setTargetFps(targetFps: number): void {
    this.minFrameIntervalMs = 1000 / Math.max(1, targetFps);
  }

  /** Starts the animation loop. */
  start(): void {
    if (this.running) {
      return;
    }

    this.running = true;
    this.animationFrameId = window.requestAnimationFrame(this.tick);
  }

  /** Stops the animation loop. */
  stop(): void {
    if (!this.running) {
      return;
    }

    window.cancelAnimationFrame(this.animationFrameId);
    this.animationFrameId = 0;
    this.running = false;
    this.lastFrameTimestamp = 0;
  }

  /** Returns whether the scheduler is currently active. */
  isRunning(): boolean {
    return this.running;
  }

  /** Removes listeners and cancels queued animation work. */
  dispose(): void {
    this.stop();
    document.removeEventListener('visibilitychange', this.handleVisibilityChange);
  }

  private readonly tick = (timestamp: number) => {
    if (!this.running) {
      return;
    }

    if (!this.visible) {
      this.animationFrameId = window.requestAnimationFrame(this.tick);
      return;
    }

    const elapsedMs = this.lastFrameTimestamp === 0 ? this.minFrameIntervalMs : timestamp - this.lastFrameTimestamp;
    if (elapsedMs >= this.minFrameIntervalMs) {
      const deltaSeconds = Math.min(0.1, elapsedMs / 1000);
      this.lastFrameTimestamp = timestamp;
      this.callback(timestamp, deltaSeconds);
    }

    this.animationFrameId = window.requestAnimationFrame(this.tick);
  };
}
