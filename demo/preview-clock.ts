/** One clock for visible previews. Pausing and hidden tabs do not advance the sample timeline. */
export class PreviewClock {
  elapsed = 0;
  private running = false;
  private raf = 0;
  private last?: number;
  private painted = 0;
  private listeners = new Set<(elapsed: number) => void>();
  subscribe(listener: (elapsed: number) => void): () => void {
    this.listeners.add(listener);
    listener(this.elapsed);
    this.schedule();
    return () => {
      this.listeners.delete(listener);
      if (!this.listeners.size) this.stop();
    };
  }
  setRunning(running: boolean): void {
    this.running = running;
    if (running) this.schedule();
    else this.stop();
  }
  private schedule(): void {
    if (!this.raf && this.running && this.listeners.size)
      this.raf = requestAnimationFrame(this.tick);
  }
  private tick = (now: number) => {
    this.raf = 0;
    if (!this.running) return;
    if (this.last !== undefined) this.elapsed += Math.min(0.2, (now - this.last) / 1000);
    this.last = now;
    if (now - this.painted >= 1000 / 20) {
      this.painted = now;
      for (const listener of this.listeners) listener(this.elapsed);
    }
    this.schedule();
  };
  private stop(): void {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.last = undefined;
  }
  destroy(): void {
    this.stop();
    this.listeners.clear();
    this.running = false;
  }
}
