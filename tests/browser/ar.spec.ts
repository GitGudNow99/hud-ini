import { setChecked, pick } from './ui';
import { expect, test } from '@playwright/test';
import type { HudFrame } from '../../src/types.js';
const rendererUrl = `/@fs${new URL('../../src/render.ts', import.meta.url).pathname}`;

test('AR geometry spans the viewport without instrument masks at every HUD size', async ({
  page,
}) => {
  await page.goto('/#lab');
  const samples = await page.evaluate(
    async ({ rendererUrl }) => {
      const { renderHud } = await import(rendererUrl);
      const canvas = document.createElement('canvas');
      canvas.width = 1050;
      canvas.height = 700;
      const ctx = canvas.getContext('2d')!;
      return ['small', 'medium', 'large', 'expired', 'hidden'].map((state) => {
        renderHud(
          ctx,
          {
            time: state === 'expired' ? 8 : 6,
            source: 'demo',
            label: 'TEST',
            outputs: [
              {
                id: 'test',
                label: 'TEST',
                unit: '%',
                min: 0,
                max: 100,
                command: { value: 50, at: 6 },
              },
            ],
            ar: {
              camera: {
                at: 6,
                position: [0, 0, 0],
                viewProjection: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
              },
              objects: [
                {
                  id: 'across',
                  kind: 'route',
                  label: 'ACROSS',
                  at: 6,
                  color: '#ff00ff',
                  points: [
                    [-1, -0.7, 0],
                    [1, -0.7, 0],
                  ],
                },
              ],
            },
          },
          { width: 1050, height: 700 },
          {
            size: state,
            panels: {
              ar: state !== 'hidden',
              arLabels: false,
              heading: false,
              tapes: false,
              attitude: false,
              reticle: false,
            },
          },
        );
        return [16, 98, 210, 600, 948, 1032].map((x) => {
          // Allow a foreground instrument stroke or a dash gap within each sampled region.
          const pixels = ctx.getImageData(x - 16, 592, 32, 6).data;
          return pixels.some(
            (v, i) =>
              i % 4 === 0 &&
              v > 70 &&
              pixels[i + 1]! < 30 &&
              pixels[i + 2]! > 70 &&
              pixels[i + 3]! > 100,
          );
        });
      });
    },
    { rendererUrl },
  );
  for (const sample of samples.slice(0, 3)) expect(sample).toEqual(Array(6).fill(true));
  for (const sample of samples.slice(3)) expect(sample.some(Boolean)).toBe(false);
});

test('AR switches, world anchors, camera changes and gallery data states work', async ({
  page,
}) => {
  await page.goto('/#lab');
  await page.locator('#load-status').waitFor({ state: 'hidden' });
  const toggle = page.getByRole('checkbox', { name: 'AR objects (3D)', exact: true });
  const before = await page.locator('#hud canvas').screenshot();
  await setChecked(toggle, true);
  expect((await page.locator('#hud canvas').screenshot()).equals(before)).toBe(false);
  const state = () =>
    page.locator('#frame-data').evaluate((el) => {
      const ar = (JSON.parse(el.textContent!) as HudFrame).ar!;
      return {
        matrix: ar.camera.viewProjection,
        objects: ar.objects.map((o) => ({ ...o, at: 0, visibility: undefined })),
      };
    });
  const first = await state();
  await page.getByRole('slider', { name: 'Scenario time', exact: true }).fill('12');
  await expect.poll(async () => (await state()).matrix).not.toEqual(first.matrix);
  const moved = await state();
  expect(moved.objects).toEqual(first.objects);
  expect(moved.matrix).not.toEqual(first.matrix);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(async () => (await state()).matrix).not.toEqual(moved.matrix);
  await setChecked(page.getByRole('checkbox', { name: 'Freeze telemetry', exact: true }), true);
  await expect(page.locator('#hud canvas')).toHaveAttribute('aria-label', /AR camera unavailable/, {
    timeout: 5000,
  });
  await page.getByRole('radio', { name: 'Components', exact: true }).click();
  await page.getByRole('radio', { name: 'AR objects', exact: true }).click();
  await expect(page.locator('[data-component]')).toHaveCount(5);
  await expect(page.locator('[data-component="ar-terrain"] canvas')).toHaveAttribute(
    'aria-label',
    /Anchor line of sight visible.*Anchor line of sight occluded.*Anchor line of sight unknown/,
  );
  await pick(page, 'component-state', 'stale');
  await expect(page.locator('[data-component="ar-landing"] canvas')).toHaveAttribute(
    'aria-label',
    /AR camera unavailable/,
  );
  await pick(page, 'component-state', 'missing');
  await expect(page.locator('[data-component="ar-landing"] canvas')).not.toHaveAttribute(
    'aria-label',
    /AR LZ/,
  );
});
