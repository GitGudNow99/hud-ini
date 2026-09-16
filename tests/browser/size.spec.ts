import { pick, selectVehicle } from './ui';
import { expect, test } from '@playwright/test';

test('HUD sizes change rendered instruments, retain camera framing and survive vehicle changes', async ({
  page,
}) => {
  await page.goto('/#lab');
  await page.locator('#load-status').waitFor({ state: 'hidden' });
  await expect(page.locator('#hud canvas')).toHaveAttribute('aria-label', /Heading/);
  const cameraOnly = { style: '#hud { visibility: hidden !important; }' };
  const camera = await page.locator('#scene').screenshot(cameraOnly);
  const images: Buffer[] = [];
  for (const size of ['small', 'medium', 'large']) {
    await pick(page, 'hud-size', size);
    await expect(page.locator('#hud-size')).toContainText(size[0]!.toUpperCase() + size.slice(1));
    await expect(page.locator('#snippet')).toContainText(`size: '${size}'`);
    images.push(await page.locator('#hud canvas').screenshot());
    expect((await page.locator('#scene').screenshot(cameraOnly)).equals(camera)).toBe(true);
  }
  expect(images[0]!.equals(images[1]!)).toBe(false);
  expect(images[1]!.equals(images[2]!)).toBe(false);
  await selectVehicle(page, 'helicopter');
  await page.locator('#load-status').waitFor({ state: 'hidden' });
  await expect(page.locator('#hud-size')).toContainText('Large');
  await expect(page.locator('#snippet')).toContainText("size: 'large'");
  expect(
    await page.evaluate(() =>
      [...document.fonts].some((font) => font.family === 'Rajdhani' && font.status === 'loaded'),
    ),
  ).toBe(true);
});
