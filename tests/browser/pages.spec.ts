import { expect, test } from '@playwright/test';
import { pick, setChecked } from './ui';

test('home uses recorded video, synchronizes pause, and opens the selected vehicle', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  const video = page.locator('#home-preview video');
  const canvas = page.locator('#home-preview canvas');
  await expect(canvas).toHaveAttribute('aria-label', /Heading/);
  await expect
    .poll(() => video.evaluate((v: HTMLVideoElement) => v.currentTime))
    .toBeGreaterThan(0.2);
  expect(await video.evaluate((v: HTMLVideoElement) => v.videoWidth)).toBe(1280);
  await page.getByRole('button', { name: 'Pause home preview' }).click();
  const time = await video.evaluate((v: HTMLVideoElement) => v.currentTime);
  const pixels = await canvas.evaluate((c: HTMLCanvasElement) => c.toDataURL());
  await page.waitForTimeout(250);
  expect(await video.evaluate((v: HTMLVideoElement) => v.currentTime)).toBe(time);
  expect(await canvas.evaluate((c: HTMLCanvasElement) => c.toDataURL())).toBe(pixels);
  await setChecked(page.getByRole('checkbox', { name: 'HUD', exact: true }), false);
  await expect(canvas).toBeHidden();
  await setChecked(page.getByRole('checkbox', { name: 'HUD', exact: true }), true);
  // Each recording carries its own telemetry, so switching reloads both video and scenario.
  await pick(page, 'home-recording', 'agz-zurich');
  await expect(canvas).toBeVisible();
  await expect(video).toHaveJSProperty('videoHeight', 720);
  await pick(page, 'home-recording', 'uzh-fpv-outdoor-1-mavlink');
  await expect(canvas).toBeVisible();
  await page.getByRole('link', { name: 'Customize in vehicle lab' }).click();
  await expect(page).toHaveURL(/#lab\/multirotor$/);
  await expect(page.locator('#hud canvas')).toHaveAttribute('aria-label', /Altitude/);
  await page.getByRole('link', { name: 'hud-ini home', exact: true }).click();
  await expect(page.locator('#home-preview video')).toBeVisible();
  const source = page.getByRole('link', { name: 'Source on GitHub' });
  await expect(source).toHaveAttribute('href', 'https://github.com/GitGudNow99/hud-ini');
  await expect(source).toHaveAttribute('target', '_blank');
  expect(errors).toEqual([]);
});

test('home respects reduced motion and keeps its layout within narrow viewports', async ({
  page,
}, info) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(page.locator('#home-preview canvas')).toBeVisible();
  expect(await page.locator('video').evaluate((v: HTMLVideoElement) => v.paused)).toBe(true);
  for (const width of [1440, 768, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
      .toBe(true);
    await page.screenshot({ path: info.outputPath(`home-${width}.png`) });
  }
});

test('docs open without fixtures, support deep links, search, copying and topic navigation', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.route('**/fixtures/**', (route) => route.abort());
  await page.goto('/#docs/');
  await expect(page.getByRole('heading', { name: 'Getting started', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Copy React · CameraView.tsx' }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain(
    "import { HudIni } from '@gitgudnow99/hud-ini/react'",
  );
  await page.getByRole('searchbox', { name: 'Search documentation' }).fill('occlusion');
  await page
    .locator('[aria-label="Documentation topics"]')
    .getByRole('link', { name: 'Terrain occlusion' })
    .click();
  await expect(page.getByRole('heading', { name: 'Terrain occlusion', exact: true })).toBeVisible();
  await page.goto('/#docs/rendering/recorded-video');
  await expect(page.getByRole('heading', { name: 'Recorded video', exact: true })).toBeInViewport();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Recorded video', exact: true })).toBeInViewport();
  await page.goto('/#docs/missing');
  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/#docs/vehicles');
  await pick(page, 'docs-topic', 'telemetry');
  await expect(
    page.getByRole('heading', { name: 'Telemetry and MAVLink', exact: true }),
  ).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('a failed video has a usable retry and leaves documentation reachable', async ({ page }) => {
  // Block the telemetry as well as the recording. A media element reports a blocked source
  // through its own error event, which headless browsers do not always raise before the
  // assertion runs, while a rejected fetch reaches the same state every time.
  const blocked = ['**/replay/uzh-fpv-outdoor-1.mp4', '**/replay/uzh-fpv-outdoor-1-mavlink.json'];
  for (const pattern of blocked) await page.route(pattern, (route) => route.abort());
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Preview unavailable' })).toBeVisible();
  for (const pattern of blocked) await page.unroute(pattern);
  await page.getByRole('button', { name: 'Retry preview' }).click();
  await expect(page.getByRole('heading', { name: 'Preview unavailable' })).toBeHidden();
  // Only the video error path pauses the preview, so the toggle can sit in either state by the
  // time the retry succeeds. Read its label rather than assuming which failure arrived first.
  const toggle = page.getByRole('button', { name: /home preview$/ });
  if ((await toggle.getAttribute('aria-label')) === 'Play home preview') await toggle.click();
  await expect
    .poll(() => page.locator('video').evaluate((v: HTMLVideoElement) => v.currentTime))
    .toBeGreaterThan(0);
  await page.getByRole('link', { name: 'Get started', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Getting started', exact: true })).toBeVisible();
});
