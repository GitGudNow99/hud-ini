import { renderHud } from './render.js';
import { telemetrySummary } from './telemetry.js';
import type { HudFrame, HudOptions } from './types.js';

/** Manage a caller-sized canvas. Call update with a clock that continues when live data stops. */
export class HudController {
  private readonly context: CanvasRenderingContext2D;
  private readonly observer: ResizeObserver;
  private disposed = false;
  private frame: HudFrame | undefined;
  private options: HudOptions;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    options: HudOptions = {},
  ) {
    const context = canvas.getContext('2d');
    if (!context) throw new Error('hud-ini requires a 2D canvas context');
    this.context = context;
    this.options = options;
    this.observer = new ResizeObserver(() => this.draw());
    this.observer.observe(canvas);
    canvas.setAttribute('role', 'img');
  }
  update(frame: HudFrame, options?: HudOptions): void {
    if (this.disposed) return;
    this.frame = frame;
    if (options) this.options = options;
    this.draw();
  }
  clear(): void {
    this.frame = undefined;
    this.context.save();
    this.context.resetTransform();
    this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.context.restore();
    this.canvas.setAttribute('aria-label', 'No telemetry');
  }
  private draw(): void {
    if (this.disposed || !this.frame) return;
    const { width, height } = this.canvas.getBoundingClientRect();
    if (width <= 0 || height <= 0) return;
    const pixelRatio = Math.max(1, window.devicePixelRatio || 1);
    const physicalWidth = Math.round(width * pixelRatio),
      physicalHeight = Math.round(height * pixelRatio);
    if (this.canvas.width !== physicalWidth || this.canvas.height !== physicalHeight) {
      this.canvas.width = physicalWidth;
      this.canvas.height = physicalHeight;
    }
    renderHud(this.context, this.frame, { width, height, pixelRatio }, this.options);
    this.canvas.setAttribute('aria-label', telemetrySummary(this.frame, this.options.staleAfterS));
  }
  destroy(): void {
    this.disposed = true;
    this.observer.disconnect();
  }
}
