import { HudController } from './controller.js';
import type { HudFrame, HudOptions } from './types.js';

export interface HudIniElement extends HTMLElement {
  frame: HudFrame | undefined;
  options: HudOptions;
}

/** Explicit registration keeps imports safe during server rendering. */
export function defineHudIni(tagName = 'hud-ini'): void {
  if (typeof customElements === 'undefined' || customElements.get(tagName)) return;
  class Element extends HTMLElement implements HudIniElement {
    private controller?: HudController;
    private currentFrame?: HudFrame;
    private currentOptions: HudOptions = {};
    private readonly canvas: HTMLCanvasElement;
    constructor() {
      super();
      const root = this.attachShadow({ mode: 'open' });
      const style = document.createElement('style');
      style.textContent =
        ':host{display:block;position:relative;pointer-events:none}canvas{display:block;width:100%;height:100%}';
      this.canvas = document.createElement('canvas');
      root.append(style, this.canvas);
    }
    connectedCallback(): void {
      this.controller = new HudController(this.canvas, this.currentOptions);
      this.refresh();
    }
    disconnectedCallback(): void {
      this.controller?.destroy();
      this.controller = undefined;
    }
    get frame(): HudFrame | undefined {
      return this.currentFrame;
    }
    set frame(value: HudFrame | undefined) {
      this.currentFrame = value;
      this.refresh();
    }
    get options(): HudOptions {
      return this.currentOptions;
    }
    set options(value: HudOptions) {
      this.currentOptions = value;
      this.refresh();
    }
    private refresh(): void {
      if (this.currentFrame) this.controller?.update(this.currentFrame, this.currentOptions);
      else this.controller?.clear();
    }
  }
  customElements.define(tagName, Element);
}
