import { expect, test } from '@playwright/test';
import { PerspectiveCamera, Vector3 } from 'three';
import type { HudFrame } from '../../src/types.js';

const rendererUrl = `/@fs${new URL('../../src/render.ts', import.meta.url).pathname}`;

test('visible horizon survives pitch changes with a corner vehicle drawing', async ({ page }) => {
  await page.goto('/#lab');
  for (const { pitch, roll } of [
    { pitch: 10, roll: 0 },
    { pitch: 20, roll: 0 },
    { pitch: 12, roll: -15 },
  ]) {
    const camera = new PerspectiveCamera(55, 390 / 520, 0.1, 3000);
    camera.rotation.set((pitch * Math.PI) / 180, 0, (-roll * Math.PI) / 180, 'YXZ');
    camera.updateMatrixWorld();
    const point = new Vector3(10, 0, -100).project(camera);
    const screen = { x: ((point.x + 1) * 390) / 2, y: ((1 - point.y) * 520) / 2 };
    const visible = await page.evaluate(
      async ({ rendererUrl, pitch, roll, screen }) => {
        const { renderHud } = await import(rendererUrl);
        const canvas = document.createElement('canvas');
        canvas.width = 390;
        canvas.height = 520;
        const ctx = canvas.getContext('2d')!;
        const r = (value: number) => ({ value, at: 0 });
        renderHud(
          ctx,
          {
            time: 0,
            source: 'demo',
            label: 'Horizon clearance',
            pitchDeg: r(pitch),
            rollDeg: r(roll),
            outputs: Array.from({ length: 12 }, (_, i) => ({
              id: String(i),
              label: `M${i + 1}`,
              min: 0,
              max: 100,
              unit: '%',
              command: r(50),
              indicator: {
                glyph: 'rotor',
                position: [Math.cos((i * Math.PI) / 6) * 0.78, Math.sin((i * Math.PI) / 6) * 0.78],
              },
            })),
          },
          { width: 390, height: 520 },
          {
            preset: 'multirotor',
            panels: { heading: false, tapes: false, reticle: false },
          },
        );
        const pixels = ctx.getImageData(
          Math.round(screen.x) - 3,
          Math.round(screen.y) - 3,
          7,
          7,
        ).data;
        for (let i = 0; i < pixels.length; i += 4)
          if (
            pixels[i]! < 120 &&
            pixels[i + 1]! - pixels[i]! > 55 &&
            pixels[i + 2]! - pixels[i]! > 55
          )
            return true;
        return false;
      },
      { rendererUrl, pitch, roll, screen },
    );
    expect(visible, `Horizon at pitch ${pitch}, bank ${roll}`).toBe(true);
  }
});

test('attitude horizon follows camera projection across fields of view and HUD sizes', async ({
  page,
}) => {
  await page.goto('/#lab');
  for (const sample of [
    { width: 1200, height: 800, pitch: 10, roll: 15, fov: 55 },
    { width: 1200, height: 800, pitch: -8, roll: -20, fov: 40 },
    { width: 390, height: 520, pitch: 7, roll: 25, fov: 90 },
  ].flatMap((sample) =>
    (['small', 'medium', 'large'] as const).map((size) => ({ ...sample, size })),
  )) {
    const segments = await page.evaluate(
      async ({ rendererUrl, sample }) => {
        const { renderHud } = await import(rendererUrl);
        const canvas = document.createElement('canvas');
        canvas.width = sample.width;
        canvas.height = sample.height;
        const ctx = canvas.getContext('2d')!;
        const segments: { x: number; y: number }[][] = [];
        let points: { x: number; y: number }[] = [];
        const begin = ctx.beginPath.bind(ctx);
        const move = ctx.moveTo.bind(ctx);
        const line = ctx.lineTo.bind(ctx);
        const stroke = ctx.stroke.bind(ctx);
        ctx.beginPath = () => {
          points = [];
          begin();
        };
        ctx.moveTo = (x, y) => {
          const p = ctx.getTransform().transformPoint({ x, y });
          points = [{ x: p.x, y: p.y }];
          move(x, y);
        };
        ctx.lineTo = (x, y) => {
          const p = ctx.getTransform().transformPoint({ x, y });
          points.push({ x: p.x, y: p.y });
          line(x, y);
        };
        ctx.stroke = (path?: Path2D) => {
          if (!path && points.length === 2 && ctx.strokeStyle === '#49ded8')
            segments.push([...points]);
          if (path) stroke(path);
          else stroke();
        };
        renderHud(
          ctx,
          {
            time: 0,
            source: 'demo',
            label: 'Projection test',
            pitchDeg: { value: sample.pitch, at: 0 },
            rollDeg: { value: sample.roll, at: 0 },
          },
          { width: sample.width, height: sample.height },
          {
            preset: 'plane',
            size: sample.size,
            verticalFovDeg: sample.fov,
            panels: { heading: false, tapes: false, reticle: false, actuators: false },
          },
        );
        return segments;
      },
      { rendererUrl, sample },
    );
    const camera = new PerspectiveCamera(sample.fov, sample.width / sample.height, 0.1, 3000);
    camera.rotation.set((sample.pitch * Math.PI) / 180, 0, (-sample.roll * Math.PI) / 180, 'YXZ');
    camera.updateMatrixWorld();
    const projected = [-10, 10].map((x) => {
      const p = new Vector3(x, 0, -100).project(camera);
      return { x: ((p.x + 1) * sample.width) / 2, y: ((1 - p.y) * sample.height) / 2 };
    });
    const [a, b] = projected as [(typeof projected)[number], (typeof projected)[number]];
    expect(segments, JSON.stringify(sample)).toHaveLength(2);
    for (const segment of segments)
      for (const p of segment) {
        const distance =
          Math.abs((b.y - a.y) * p.x - (b.x - a.x) * p.y + b.x * a.y - b.y * a.x) /
          Math.hypot(b.y - a.y, b.x - a.x);
        expect(distance).toBeLessThan(0.001);
      }
  }
});

test('instruments distinguish missing, stale, invalid and future samples without retaining commands', async ({
  page,
}) => {
  await page.goto('/#lab');
  const labels = await page.evaluate(
    async ({ rendererUrl }) => {
      const { renderHud } = await import(rendererUrl);
      const ctx = document.createElement('canvas').getContext('2d')!;
      let text: string[] = [];
      const fill = ctx.fillText.bind(ctx);
      ctx.fillText = (label, x, y, maxWidth) => {
        text.push(label);
        fill(label, x, y, maxWidth);
      };
      const r = (value: number) => ({ value, at: 4 });
      const fresh: HudFrame = {
        time: 4,
        source: 'demo',
        label: 'ROV',
        mode: 'POSHOLD',
        armed: true,
        heartbeatAt: 4,
        headingDeg: r(0),
        rollDeg: r(0),
        pitchDeg: r(0),
        groundSpeedMps: r(1.3),
        depthM: r(9),
        outputs: [
          { id: 'thruster', label: 'Thruster', unit: '%', min: -100, max: 100, command: r(63) },
        ],
      };
      const states = [
        fresh,
        { ...fresh, time: 6 },
        { ...fresh, groundSpeedMps: undefined },
        { ...fresh, groundSpeedMps: { ...r(1.3), valid: false } },
        { ...fresh, groundSpeedMps: { value: 1.3, at: 5 } },
        { ...fresh, armed: false },
      ];
      return states.map((frame) => {
        text = [];
        renderHud(ctx, frame, { width: 1200, height: 800 }, { preset: 'submarine' });
        return text;
      });
    },
    { rendererUrl },
  );
  expect(labels[0]).toEqual(
    expect.arrayContaining(['DATA CURRENT', 'POSHOLD · ARMED', '63', '0.8', '1.6']),
  );
  expect(labels[1]).toEqual(expect.arrayContaining(['DATA STALE', 'STALE', 'MODE -']));
  expect(labels[1]).not.toContain('63');
  expect(labels[2]).toEqual(expect.arrayContaining(['DATA PARTIAL', 'NO DATA']));
  expect(labels[3]).toEqual(expect.arrayContaining(['DATA INVALID', 'INVALID']));
  expect(labels[4]).toEqual(expect.arrayContaining(['CLOCK MISMATCH', 'CLOCK']));
  expect(labels[5]).toContain('POSHOLD · DISARMED');
});
