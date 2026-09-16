import { setChecked, selectVehicle } from './ui';
import { expect, test } from '@playwright/test';
import type { HudOptions } from '../../src/types.js';

const rendererUrl = `/@fs${new URL('../../src/render.ts', import.meta.url).pathname}`;

test('camera inset width is adjustable and survives switching vehicles', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto('/#lab');
  await page.locator('#load-status').waitFor({ state: 'hidden' });
  await page.getByText('Additional instruments', { exact: true }).click();
  await expect(page.locator('#inset-width')).toBeHidden();
  await setChecked(page.getByRole('checkbox', { name: 'Camera inset', exact: true }), true);
  const slider = page.getByRole('slider', { name: 'Camera inset width', exact: true });
  await expect(slider).toHaveValue('240');
  await slider.focus();
  for (let i = 0; i < 4; i++) await slider.press('ArrowRight');
  await expect(slider).toHaveValue('320');
  await expect(page.locator('#snippet')).toContainText('width: 320');
  await selectVehicle(page, 'multirotor');
  await page.locator('#load-status').waitFor({ state: 'hidden' });

  await expect(slider).toHaveValue('320');
  await setChecked(page.getByRole('checkbox', { name: 'Camera inset', exact: true }), false);
  await expect(slider).toBeHidden();
  await expect(page.locator('#snippet')).not.toContainText('cameraVideo');
  await page.getByRole('radio', { name: 'Components', exact: true }).click();
  await page.getByRole('link', { name: /^Camera inset/ }).click();
  const detailSlider = page.getByRole('slider', { name: 'Camera inset width', exact: true });
  await detailSlider.focus();
  await detailSlider.press('End');
  await expect(detailSlider).toHaveValue('400');
  await page.getByRole('tab', { name: 'Code', exact: true }).click();
  await expect(page.locator('#component-detail-code')).toContainText('width: 400');
});

test('inset pixels resize without drifting or stretching and expire with the source', async ({
  page,
}) => {
  await page.goto('/#lab');
  const result = await page.evaluate(
    async ({ rendererUrl }) => {
      const { renderHud } = await import(rendererUrl);
      const image = document.createElement('canvas');
      image.width = 400;
      image.height = 300;
      const source = image.getContext('2d')!;
      source.fillStyle = '#00ff00';
      source.fillRect(0, 0, 400, 300);
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d')!;
      const panels = {
        frame: false,
        identity: false,
        heading: false,
        attitude: false,
        tapes: false,
        reticle: false,
        optics: false,
        actuators: false,
        controls: false,
        position: false,
        power: false,
        status: false,
        messages: false,
        guidance: false,
      };
      function bounds(
        width: number | undefined,
        viewport = { width: 1200, height: 1000 },
        time = 6,
        extra: Partial<NonNullable<HudOptions['inset']>> = {},
      ) {
        canvas.width = viewport.width * 2;
        canvas.height = viewport.height * 2;
        renderHud(
          ctx,
          { time, source: 'demo', label: 'Inset test' },
          { ...viewport, pixelRatio: 2 },
          { panels, inset: { image, at: 6, label: 'CAMERA', width, ...extra } },
        );
        const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        let left = Infinity,
          top = Infinity,
          right = -1,
          bottom = -1;
        for (let y = 0; y < canvas.height; y++)
          for (let x = 0; x < canvas.width; x++) {
            const i = (y * canvas.width + x) * 4;
            if (
              pixels[i] === 0 &&
              pixels[i + 1] === 255 &&
              pixels[i + 2] === 0 &&
              pixels[i + 3]! > 250
            ) {
              left = Math.min(left, x);
              top = Math.min(top, y);
              right = Math.max(right, x);
              bottom = Math.max(bottom, y);
            }
          }
        return right < 0
          ? null
          : {
              left: left / 2,
              top: top / 2,
              right: (right + 1) / 2,
              bottom: (bottom + 1) / 2,
              width: (right - left + 1) / 2,
              height: (bottom - top + 1) / 2,
            };
      }
      const sizes = [160, undefined, 320, 400].map((width) => bounds(width));
      const invalid = [NaN, Infinity, 0, -10].map((width) => bounds(width));
      const constrained = bounds(400, { width: 800, height: 600 });
      const expired = bounds(400, undefined, 10);
      const unavailable = bounds(400, undefined, 6, { valid: false });
      const narrow = bounds(400, { width: 390, height: 520 });
      return { sizes, invalid, constrained, expired, unavailable, narrow };
    },
    { rendererUrl },
  );
  for (const [index, width] of [160, 240, 320, 400].entries()) {
    const box = result.sizes[index]!;
    expect(Math.abs(box.width - width)).toBeLessThanOrEqual(1);
    expect(Math.abs(box.height - width * 0.75)).toBeLessThanOrEqual(1);
    expect(box.right).toBe(result.sizes[0]!.right);
    expect(box.bottom).toBe(result.sizes[0]!.bottom);
  }
  for (const box of result.invalid) expect(box).toEqual(result.sizes[1]);
  expect(result.constrained!.width).toBeLessThan(400);
  expect(result.constrained!.top).toBeGreaterThan(330);
  expect(result.constrained!.left).toBeGreaterThan(400);
  expect(result.expired).toBeNull();
  expect(result.unavailable).toBeNull();
  expect(result.narrow).toBeNull();
});
