import { pick } from './ui';
import { expect, test } from '@playwright/test';

const pixels = (canvas: import('@playwright/test').Locator) =>
  canvas.evaluate((el) => (el as HTMLCanvasElement).toDataURL());

test('cards animate in place, pause, and stop drawing when outside the viewport', async ({
  page,
}) => {
  await page.goto('/#components');
  const heading = page.locator('[data-component="heading"] canvas');
  await expect(heading).toBeVisible();
  const originalNode = await heading.elementHandle();
  const initial = await pixels(heading);
  const power = page.locator('[data-component="power"] canvas');
  const offscreen = await pixels(power);
  await expect.poll(() => pixels(heading)).not.toBe(initial);
  expect(await originalNode!.evaluate((el) => el.isConnected)).toBe(true);
  expect(await pixels(power)).toBe(offscreen);
  await page.getByRole('button', { name: 'Pause previews' }).click();
  const paused = await pixels(heading);
  await page.waitForTimeout(350);
  expect(await pixels(heading)).toBe(paused);
  await page.getByRole('button', { name: 'Resume previews' }).click();
  await expect.poll(() => pixels(heading)).not.toBe(paused);
  await power.scrollIntoViewIfNeeded();
  await expect.poll(() => pixels(power)).not.toBe(offscreen);
  // Allow the IntersectionObserver notification for the card that just left the viewport.
  await page.waitForTimeout(100);
  const away = await pixels(heading);
  await page.waitForTimeout(300);
  expect(await pixels(heading)).toBe(away);
});

test('reduced motion starts paused and document visibility suspends the shared clock', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/#components');
  const canvas = page.locator('[data-component="heading"] canvas');
  await expect(canvas).toBeVisible();
  await expect(page.getByRole('button', { name: 'Resume previews' })).toBeVisible();
  const initial = await pixels(canvas);
  await page.waitForTimeout(300);
  expect(await pixels(canvas)).toBe(initial);
  await page.getByRole('button', { name: 'Resume previews' }).click();
  await expect.poll(() => pixels(canvas)).not.toBe(initial);
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  const hidden = await pixels(canvas);
  await page.waitForTimeout(350);
  expect(await pixels(canvas)).toBe(hidden);
  await page.evaluate(() => {
    delete (document as { hidden?: boolean }).hidden;
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect.poll(() => pixels(canvas)).not.toBe(hidden);
});

test('keyboard card navigation, shareable details and stable copyable data snapshots', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/#components');
  await page.locator('#component-search').fill('heading');
  const link = page.getByRole('link', { name: /^Heading ribbon/ });
  await link.focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#components\/heading$/);
  await expect(page.getByRole('heading', { name: 'Heading ribbon', exact: true })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Preview', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await page.getByRole('tab', { name: 'Code', exact: true }).click();
  await expect(page.locator('#component-detail-code')).toContainText(
    "import { HudIni } from 'hud-ini/react'",
  );
  await page.locator('#component-copy').click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain("preset: 'plane'");
  await page.getByRole('tab', { name: 'Sample data' }).click();
  const sample = await page.locator('#component-detail-data').textContent();
  await page.waitForTimeout(300);
  expect(await page.locator('#component-detail-data').textContent()).toBe(sample);
  await page.getByRole('tab', { name: 'Preview', exact: true }).click();
  await page.waitForTimeout(300);
  await page.getByRole('tab', { name: 'Sample data' }).click();
  await expect(page.locator('#component-detail-data')).not.toHaveText(sample!);
  await page.getByRole('link', { name: 'All components', exact: true }).click();
  await expect(page.locator('#component-search')).toHaveValue('heading');
  await page.goBack();
  await expect(page.getByRole('heading', { name: 'Heading ribbon', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.locator('#component-detail-preview canvas')).toBeVisible();
  // All three tabs are in a row above the preview, including at a narrow viewport.
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    const tabs = await page.getByRole('tablist', { name: 'Component details' }).boundingBox();
    const preview = await page.locator('#component-detail-preview').boundingBox();
    expect(tabs!.y + tabs!.height).toBeLessThanOrEqual(preview!.y);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
});

test('animation cannot revive stale instructions or missing readings', async ({ page }) => {
  await page.goto('/#components/return');
  const preview = page.locator('#component-detail-preview canvas');
  await expect(preview).toHaveAttribute('aria-label', /RETURN TO HOME/);
  await pick(page, 'component-state', 'stale');
  await expect(preview).toHaveAttribute('aria-label', /guidance unavailable/);
  await page.waitForTimeout(400);
  await expect(preview).not.toHaveAttribute('aria-label', /RETURN TO HOME/);
  await pick(page, 'component-state', 'missing');
  await page.waitForTimeout(400);
  await expect(preview).not.toHaveAttribute('aria-label', /RETURN TO HOME/);
  await page.getByRole('tab', { name: 'Sample data' }).click();
  const frame = JSON.parse((await page.locator('#component-detail-data').textContent())!);
  expect(frame.guidance).toBeUndefined();
  expect(frame.headingDeg).toBeUndefined();
  expect(frame.outputs.length).toBeGreaterThan(0);
  expect(frame.outputs.every((o: { command?: unknown }) => o.command === undefined)).toBe(true);
});
