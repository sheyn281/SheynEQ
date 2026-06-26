import type { VisualizerBackend, VisualizerProfileSettings, VisualizerRenderContext, VisualizerViewport } from './types';

/** High-DPI Canvas2D renderer with optional WebGL capability detection. */
export class Renderer {
  private readonly context2d: CanvasRenderingContext2D;
  private webgl: WebGLRenderingContext | null = null;
  private viewport: VisualizerViewport = {
    width: 1,
    height: 1,
    pixelRatio: 1
  };
  private resizeObserver: ResizeObserver | null = null;
  private isDisposed = false;
  private readonly handleResize = () => {
    this.resize();
  };

  /** Creates a renderer bound to a canvas element. */
  constructor(
    private readonly canvas: HTMLCanvasElement,
    private profile: VisualizerProfileSettings
  ) {
    const context2d = this.canvas.getContext('2d', { alpha: true });

    if (!context2d) {
      throw new Error('Canvas2D is required for SheynEQ visualizer rendering.');
    }

    this.context2d = context2d;
    this.webgl = this.createWebGlContext(profile.preferredBackend);
    this.resize();
    this.observeResize();
  }

  /** Updates profile-dependent render options without restarting. */
  setProfile(profile: VisualizerProfileSettings): void {
    this.assertActive();
    this.profile = profile;
    this.webgl = this.createWebGlContext(profile.preferredBackend);
    this.resize();
  }

  /** Clears the canvas with a low-cost fade that preserves motion. */
  clear(alpha = 0.22): void {
    this.assertActive();
    const { width, height } = this.viewport;
    this.context2d.save();
    this.context2d.setTransform(1, 0, 0, 1, 0, 0);
    this.context2d.globalCompositeOperation = 'source-over';
    this.context2d.fillStyle = `rgba(6, 9, 16, ${alpha})`;
    this.context2d.fillRect(0, 0, width * this.viewport.pixelRatio, height * this.viewport.pixelRatio);
    this.context2d.restore();
  }

  /** Returns the render context consumed by visualizer modes. */
  getRenderContext(): VisualizerRenderContext {
    this.assertActive();
    return {
      context2d: this.context2d,
      webgl: this.webgl,
      viewport: this.viewport,
      profile: this.profile
    };
  }

  /** Resizes the canvas backing store for high-DPI output. */
  resize(): void {
    this.assertActive();
    const rect = this.canvas.getBoundingClientRect();
    const width = Math.max(1, rect.width || this.canvas.clientWidth || 1);
    const height = Math.max(1, rect.height || this.canvas.clientHeight || 1);
    const pixelRatio = Math.min(window.devicePixelRatio || 1, this.profile.maxDevicePixelRatio);
    const backingWidth = Math.max(1, Math.floor(width * pixelRatio));
    const backingHeight = Math.max(1, Math.floor(height * pixelRatio));

    if (this.canvas.width !== backingWidth || this.canvas.height !== backingHeight) {
      this.canvas.width = backingWidth;
      this.canvas.height = backingHeight;
    }

    this.viewport = { width, height, pixelRatio };
    this.context2d.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  }

  /** Releases observers and graphics contexts. */
  dispose(): void {
    if (this.isDisposed) {
      return;
    }

    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    window.removeEventListener('resize', this.handleResize);
    this.context2d.setTransform(1, 0, 0, 1, 0, 0);
    this.context2d.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.webgl?.getExtension('WEBGL_lose_context')?.loseContext();
    this.webgl = null;
    this.isDisposed = true;
  }

  private createWebGlContext(preferredBackend: VisualizerBackend): WebGLRenderingContext | null {
    if (preferredBackend !== 'webgl') {
      return null;
    }

    return this.canvas.getContext('webgl', {
      alpha: true,
      antialias: false,
      depth: false,
      stencil: false,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: false
    });
  }

  private observeResize(): void {
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', this.handleResize);
      return;
    }

    this.resizeObserver = new ResizeObserver(() => {
      this.resize();
    });
    this.resizeObserver.observe(this.canvas);
  }

  private assertActive(): void {
    if (this.isDisposed) {
      throw new Error('Renderer has been disposed.');
    }
  }
}
