import { useEffect, useRef } from 'react';
import { renderHud, telemetrySummary } from '../src/index.js';
import type { Specimen } from './catalogue.js';
import type { PreviewClock } from './preview-clock.js';
import type { PreviewData } from './preview-data.js';

export function PreviewCanvas({
  item,
  data,
  clock,
  state,
  theme,
  insetWidth = 240,
  scale = 1.3,
}: {
  item: Specimen;
  data: PreviewData;
  clock: PreviewClock;
  state: string;
  theme: string;
  insetWidth?: number;
  scale?: number;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current!;
    const [width, height] = item.cameraSize ?? [1050, 700];
    const [x, y, cw, ch] =
      item.id === 'inset'
        ? [960 - insetWidth, 871 - insetWidth * 0.75, insetWidth + 24, insetWidth * 0.75 + 36]
        : item.crop;
    canvas.width = cw! * 2;
    canvas.height = ch! * 2;
    canvas.style.width = `${cw! * scale}px`;
    const paint = (elapsed: number) => {
      const source = data.surface(width * 2, height * 2);
      const frame = data.frame(item, elapsed, state);
      renderHud(
        source.getContext('2d')!,
        frame,
        { width, height, pixelRatio: 2 },
        data.options(item, elapsed, state, insetWidth),
      );
      const ctx = canvas.getContext('2d')!;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(source, x! * 2, y! * 2, cw! * 2, ch! * 2, 0, 0, canvas.width, canvas.height);
      canvas.setAttribute('aria-label', `${item.title}. ${telemetrySummary(frame)}`);
    };
    paint(clock.elapsed);
    let unsubscribe: (() => void) | undefined;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting) unsubscribe ??= clock.subscribe(paint);
      else {
        unsubscribe?.();
        unsubscribe = undefined;
      }
    });
    observer.observe(canvas);
    return () => {
      observer.disconnect();
      unsubscribe?.();
    };
  }, [item, data, clock, state, theme, insetWidth, scale]);
  return <canvas ref={ref} role="img" aria-label={item.title} />;
}
