import { setChecked, pick, selectVehicle } from './ui';
import { expect, test } from '@playwright/test';
import type { HudIniElement } from '../../src/element.js';

async function loaded(page: import('@playwright/test').Page) {
  await page.locator('#load-status').waitFor({ state: 'hidden' });
  await expect(page.locator('#hud canvas')).toHaveAttribute('aria-label', /Heading/);
}

test('all recorded MAVLink types select and render without runtime errors', async ({ page }) => {
  test.setTimeout(60000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/#lab');
  await loaded(page);
  const manifest = await (await page.request.get('/fixtures/manifest.json')).json();
  for (const scenario of manifest.scenarios) {
    await selectVehicle(page, scenario.preset);
    await loaded(page);
    await pick(page, 'variant', scenario.id);
    await loaded(page);
    await expect
      .poll(() =>
        page
          .locator('#frame-data')
          .evaluate((el) => JSON.parse(el.textContent || 'null')?.vehicleType),
      )
      .toBe(scenario.mavType);
  }
  expect(errors).toEqual([]);
  await expect(page.locator('#view')).toHaveCount(0);
});

test('white labeling, playback, visibility, and stale-command behavior', async ({ page }) => {
  await page.goto('/#lab');
  await loaded(page);
  await page.locator('#vehicle-label').fill('TEST VESSEL');
  await expect(page.locator('#hud canvas')).toHaveAttribute('aria-label', /TEST VESSEL/);
  await page.getByRole('button', { name: 'Play scenario' }).click();
  await expect
    .poll(() => page.getByRole('slider', { name: 'Scenario time', exact: true }).inputValue())
    .not.toBe('6');
  await page.getByRole('button', { name: 'Pause scenario' }).click();
  await setChecked(page.getByRole('checkbox', { name: 'Freeze telemetry', exact: true }), true);
  await expect(page.locator('#hud canvas')).toHaveAttribute(
    'aria-label',
    /Rudder command unavailable/,
    { timeout: 5000 },
  );
  await setChecked(page.getByRole('checkbox', { name: 'Freeze telemetry', exact: true }), false);
  await expect(page.locator('#hud canvas')).not.toHaveAttribute(
    'aria-label',
    /Rudder command unavailable/,
  );
  await setChecked(page.getByRole('checkbox', { name: 'HUD', exact: true }), false);
  await expect(page.locator('#hud')).toBeHidden();
  await setChecked(page.getByRole('checkbox', { name: 'HUD', exact: true }), true);
  await expect(page.locator('#hud')).toBeVisible();
  const framed = await page.locator('#hud canvas').screenshot();
  await setChecked(page.getByRole('checkbox', { name: 'Corner frame' }), false);
  await expect
    .poll(async () => (await page.locator('#hud canvas').screenshot()).equals(framed))
    .toBe(false);
  await expect(page.locator('#snippet')).toContainText('frame: false');
  await setChecked(page.getByRole('checkbox', { name: 'Corner frame' }), true);
  await expect
    .poll(async () => (await page.locator('#hud canvas').screenshot()).equals(framed))
    .toBe(true);
  await expect(page.locator('#snippet')).not.toContainText('frame: false');
});

test('overlay leaves the camera open at desktop, tablet and mobile sizes', async ({
  page,
}, info) => {
  await page.goto('/#lab');
  await loaded(page);
  for (const size of [
    { width: 1600, height: 1000 },
    { width: 1024, height: 900 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(size);
    await selectVehicle(page, 'submarine');
    await loaded(page);
    await expect(page.locator('#viewport')).toBeVisible();
    const coverage = await page.locator('#hud canvas').evaluate((c) => {
      const canvas = c as HTMLCanvasElement;
      const pixels = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
      let ink = 0;
      for (let i = 3; i < pixels.length; i += 4) if (pixels[i]! > 0) ink++;
      return ink / (canvas.width * canvas.height);
    });
    expect(coverage).toBeLessThan(0.18);
    await expect(page.locator('#vehicle-label')).toBeVisible();
    await page.locator('#viewport').screenshot({ path: info.outputPath(`sub-${size.width}.png`) });
  }
});

test('palettes and white-video contrast remain available', async ({ page }, info) => {
  await page.goto('/#lab');
  await loaded(page);
  await selectVehicle(page, 'plane');
  await loaded(page);
  await page.getByRole('button', { name: 'Theme settings' }).click();
  for (const theme of ['bright', 'day', 'dusk', 'night']) {
    await pick(page, 'theme', theme);
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    await page.locator('#viewport').screenshot({ path: info.outputPath(`${theme}.png`) });
  }
  await pick(page, 'theme', 'bright');
  await page.keyboard.press('Escape');
  await setChecked(page.getByRole('checkbox', { name: 'White video test', exact: true }), true);
  await expect(page.locator('#scene')).toBeHidden();
  await expect(page.locator('#viewport')).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  await page.locator('#viewport').screenshot({ path: info.outputPath('white-video.png') });
});

test('PTZ controls move the onboard view', async ({ page }) => {
  await page.goto('/#lab');
  await loaded(page);
  await selectVehicle(page, 'ptz');
  await loaded(page);
  const before = await page.locator('#scene').screenshot();
  await page.getByRole('slider', { name: 'Tilt', exact: true }).fill('25');
  await expect(page.locator('#hud canvas')).toHaveAttribute('aria-label', /Tilt 25.0 degrees/);
  await expect
    .poll(async () => (await page.locator('#scene').screenshot()).equals(before))
    .toBe(false);
});

test('web component clears and reconnects with its current telemetry', async ({ page }) => {
  await page.goto('/#lab');
  await loaded(page);
  const elementUrl = `/@fs${new URL('../../src/element.ts', import.meta.url).pathname}`;
  await page.evaluate(async (url) => {
    const { defineHudIni } = await import(url);
    defineHudIni();
    const source = JSON.parse(document.querySelector('#frame-data')!.textContent!);
    const el = document.createElement('hud-ini') as HudIniElement;
    el.id = 'lifecycle-hud';
    el.style.cssText = 'position:fixed;width:640px;height:360px;inset:0';
    el.frame = source;
    el.options = { preset: 'boat' };
    document.body.append(el);
  }, elementUrl);
  await expect(page.locator('#lifecycle-hud canvas')).toHaveAttribute(
    'aria-label',
    /Rudder command/,
  );
  await page.locator('#lifecycle-hud').evaluate((el) => {
    el.remove();
    (el as HudIniElement).frame = { time: 0, source: 'demo', label: 'RECONNECTED' };
    document.body.append(el);
  });
  await expect(page.locator('#lifecycle-hud canvas')).toHaveAttribute('aria-label', /RECONNECTED/);
  await page.locator('#lifecycle-hud').evaluate((el) => {
    (el as HudIniElement).frame = undefined;
  });
  await expect(page.locator('#lifecycle-hud canvas')).toHaveAttribute('aria-label', 'No telemetry');
  expect(
    await page.locator('#lifecycle-hud canvas').evaluate((el) => {
      const c = el as HTMLCanvasElement;
      return c
        .getContext('2d')!
        .getImageData(0, 0, c.width, c.height)
        .data.every((v) => v === 0);
    }),
  ).toBe(true);
});

test('React mounts, updates its clock and unmounts', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`/@fs${new URL('./react-fixture.html', import.meta.url).pathname}`);
  await expect(page.locator('canvas')).toHaveAttribute('aria-label', /Heading 0.0 degrees/);
  await page.getByRole('button', { name: 'Expire' }).click();
  await expect(page.locator('canvas')).toHaveAttribute('aria-label', /Heading unavailable/);
  await page.getByRole('button', { name: 'Toggle' }).click();
  await expect(page.locator('canvas')).toHaveCount(0);
  await page.getByRole('button', { name: 'Toggle' }).click();
  await expect(page.locator('canvas')).toHaveCount(1);
  expect(errors).toEqual([]);
});
