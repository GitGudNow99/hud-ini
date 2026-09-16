import { pick } from './ui';
import { expect, test } from '@playwright/test';
const rendererUrl = `/@fs${new URL('../../src/render.ts', import.meta.url).pathname}`;

test('heading targets touch the scale, turn trends retain direction and the readout fits its text', async ({
  page,
}) => {
  await page.goto('/#lab');
  const samples = await page.evaluate(
    async ({ rendererUrl }) => {
      const { renderHud } = await import(rendererUrl);
      await document.fonts.load('600 14px Rajdhani');
      const ctx = document.createElement('canvas').getContext('2d')!;
      const move = ctx.moveTo.bind(ctx),
        line = ctx.lineTo.bind(ctx),
        stroke = ctx.stroke.bind(ctx),
        fill = ctx.fill.bind(ctx),
        text = ctx.fillText.bind(ctx);
      let points: number[][] = [],
        paths: { points: number[][]; dashed: boolean }[] = [],
        fills: number[][][] = [],
        labels: { label: string; width: number }[] = [];
      ctx.moveTo = (x, y) => {
        points = [[x, y]];
        move(x, y);
      };
      ctx.lineTo = (x, y) => {
        points.push([x, y]);
        line(x, y);
      };
      ctx.stroke = () => {
        paths.push({ points: [...points], dashed: !!ctx.getLineDash().length });
        stroke();
      };
      ctx.fill = () => {
        fills.push([...points]);
        fill();
      };
      ctx.fillText = (label, x, y) => {
        labels.push({ label, width: ctx.measureText(label).width });
        text(label, x, y);
      };
      return [
        { time: 6, rate: -4, target: true, trend: true },
        { time: 6, rate: 40, target: false, trend: true },
        { time: 8, rate: -4, target: true, trend: true },
        { time: 6, rate: -4, target: false, trend: false },
      ].map(({ time, rate, target, trend }) => {
        paths = [];
        fills = [];
        labels = [];
        renderHud(
          ctx,
          {
            time,
            label: 'TEST',
            source: 'demo',
            headingDeg: { value: 350, at: time },
            targetHeadingDeg: { value: 20, at: 6 },
            headingRateDegS: { value: rate, at: 6 },
          },
          { width: 1050, height: 700 },
          {
            panels: {
              heading: true,
              targets: target,
              trends: trend,
              tapes: false,
              frame: false,
              attitude: false,
              reticle: false,
            },
          },
        );
        return { paths, fills, labels };
      });
    },
    { rendererUrl },
  );
  const fresh = samples[0]!;
  expect(fresh.labels.map(({ label }) => label)).toEqual(
    expect.arrayContaining(['350°', 'T 020°', '+6s']),
  );
  // 350 -> 020 is 30 degrees clockwise, mapped onto the same tick scale.
  const tipX = 525 + (30 * 225) / 80;
  expect(
    fresh.paths.some(
      ({ points }) => points.length === 4 && points[0]![0] === tipX && points[0]![1] === 32,
    ),
  ).toBe(true);
  for (const { points } of fresh.paths.filter(({ dashed }) => dashed)) {
    expect(points[0]).toEqual([525, 28]);
    expect(points[1]![0]).toBeLessThan(525);
  }
  const box = fresh.fills.find((points) => points.length === 5)!;
  expect(new Set(box.map((point) => point[0])).size).toBe(2);
  expect(new Set(box.map((point) => point[1])).size).toBe(2);
  const padding =
    box[1]![0]! - box[0]![0]! - fresh.labels.find(({ label }) => label === '350°')!.width;
  expect(padding).toBeGreaterThanOrEqual(7);
  expect(padding).toBeLessThanOrEqual(10);
  // A +240-degree trend must remain clockwise rather than wrapping onto the left.
  expect(
    samples[1]!.paths.filter(({ dashed }) => dashed).every(({ points }) => points[1]![0]! > 525),
  ).toBe(true);
  for (const sample of samples.slice(2)) {
    expect(sample.paths.some(({ dashed }) => dashed)).toBe(false);
    expect(sample.labels.some(({ label }) => label.startsWith('T ') || label === '+6s')).toBe(
      false,
    );
  }
});

test('heading box shares the tape band and markers wrap north, avoid collisions and expire', async ({
  page,
}) => {
  await page.goto('/#lab');
  const samples = await page.evaluate(
    async ({ rendererUrl }) => {
      const { renderHud } = await import(rendererUrl);
      const ctx = document.createElement('canvas').getContext('2d')!;
      const fill = ctx.fillText.bind(ctx);
      let labels: { label: string; x: number; y: number }[] = [];
      ctx.fillText = (label, x, y, maxWidth) => {
        labels.push({ label, x, y });
        fill(label, x, y, maxWidth);
      };
      return [6, 8].map((time) => {
        labels = [];
        renderHud(
          ctx,
          {
            time,
            label: 'TEST',
            source: 'demo',
            headingDeg: { value: 350, at: time },
            bearingMarkers: [
              {
                id: 'a',
                label: 'ALPHA',
                symbol: 'circle',
                selected: true,
                bearingDeg: { value: 15, at: 6 },
              },
              { id: 'b', label: 'BRAVO', symbol: 'home', bearingDeg: { value: 330, at: 6 } },
              { id: 'c', label: 'CROWDED', bearingDeg: { value: 15.1, at: 6 } },
              { id: 'd', label: 'BEHIND', bearingDeg: { value: 180, at: 6 } },
              { id: 'e', label: 'EXPIRED', bearingDeg: { value: 20, at: 1 } },
              { id: 'f', label: 'FUTURE', bearingDeg: { value: 10, at: 9 } },
            ],
          },
          { width: 1050, height: 700 },
          { panels: { heading: true, bearingMarkers: true } },
        );
        return labels;
      });
    },
    { rendererUrl },
  );
  const fresh = samples[0]!;
  const heading = fresh.find((item) => item.label === '350°')!;
  const tape = fresh.find((item) => item.label === '30')!;
  expect(Math.abs(heading.y - tape.y)).toBeLessThanOrEqual(13);
  const alpha = fresh.find((item) => item.label === 'ALPHA')!;
  const bravo = fresh.find((item) => item.label === 'BRAVO')!;
  expect(alpha.x).toBeGreaterThan(heading.x);
  expect(alpha.x - heading.x).toBeLessThan(80);
  expect(bravo.x).toBeLessThan(heading.x);
  expect(alpha.y - tape.y).toBeLessThanOrEqual(35);
  expect(fresh.map((item) => item.label)).not.toEqual(expect.arrayContaining(['CROWDED']));
  expect(fresh.some((item) => ['EXPIRED', 'FUTURE'].includes(item.label))).toBe(false);
  expect(samples[1]!.some((item) => ['ALPHA', 'BRAVO', 'BEHIND'].includes(item.label))).toBe(false);
});

test('sensor samples expose current and expired payload readings', async ({ page }) => {
  await page.goto('/#components');
  await page.getByRole('radio', { name: 'Sensors and payload', exact: true }).click();
  await expect(page.locator('[data-component]')).toHaveCount(11);
  const range = page.locator('[data-component="rangefinder"] canvas');
  const thermal = page.locator('[data-component="thermal"] canvas');
  await expect(range).toHaveAttribute('aria-label', /FWD range 48.2 metres/);
  await expect(thermal).toHaveAttribute('aria-label', /Camera IR/);
  await pick(page, 'component-state', 'stale');
  await expect(range).toHaveAttribute('aria-label', /FWD range unavailable/);
  await expect(thermal).toHaveAttribute('aria-label', /Camera unavailable/);
  await expect(thermal).not.toHaveAttribute('aria-label', /42.6/);
});
