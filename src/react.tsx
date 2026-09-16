import { useEffect, useRef } from 'react';
import type { CSSProperties } from 'react';
import { HudController } from './controller.js';
import type { HudFrame, HudOptions } from './types.js';

export interface HudIniProps {
  frame: HudFrame;
  options?: HudOptions;
  className?: string;
  style?: CSSProperties;
}

/** Fill a parent-sized overlay. Media ownership stays with the host application. */
export function HudIni({ frame, options, className, style }: HudIniProps) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const controller = useRef<HudController | null>(null);
  useEffect(() => {
    if (!canvas.current) return;
    const instance = new HudController(canvas.current);
    controller.current = instance;
    return () => {
      instance.destroy();
      controller.current = null;
    };
  }, []);
  useEffect(() => {
    controller.current?.update(frame, options ?? {});
  }, [frame, options]);
  return (
    <canvas
      ref={canvas}
      className={className}
      style={{ display: 'block', width: '100%', height: '100%', pointerEvents: 'none', ...style }}
    />
  );
}
